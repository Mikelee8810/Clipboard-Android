import type {
  EngineConfig,
  EngineEvent,
  SendReport,
  ConnectivityOpportunity,
} from '@/platform/engine';
import {
  p2pDeliveryCountsFromReport,
  p2pDeliveryStateFromReport,
  type ImportedAssetSendOptions,
  type ImportedContentAsset,
  type UnifiedContentResult,
} from '@/features/transfer';
import type { ClipboardContent } from '@/types/clipboard';
import { createLogger } from '@/support/observability';
import type {
  SyncAdapter,
  SyncAdapterDelivery,
  SyncAdapterEvent,
  SyncImportedAsset,
  SyncRuntimePolicy,
  SyncSendOptions,
  SyncStartContext,
} from '../contracts';

const log = createLogger('P2pSyncAdapter');

/** A peer-applied entry only counts as the source of a captured echo for a short moment. */
const REMOTE_ECHO_WINDOW_MS = 15 * 1000;
const REMOTE_ECHO_HISTORY_LIMIT = 10;

const PREVIEW_TRUNCATION = /(\u2026|\.\.\.)\s*$/u;

/** Engine previews may be trimmed and end with an ellipsis; compare on the stable prefix. */
function normalizePreview(value: string): { text: string; truncated: boolean } {
  const truncated = PREVIEW_TRUNCATION.test(value);
  return { text: value.replace(PREVIEW_TRUNCATION, '').trim(), truncated };
}

interface P2pEnginePort {
  start(config: EngineConfig): Promise<void>;
  stop(): Promise<void>;
  setBackgroundSyncPolicy(enabled: boolean): Promise<void>;
  resume(): Promise<void>;
  notifyConnectivityOpportunity(reason: ConnectivityOpportunity): Promise<void>;
  refreshPeerConnections(): Promise<unknown>;
  subscribeEvents(listener: (event: EngineEvent) => void): () => void;
}

interface P2pSpacePort {
  refresh(options?: { afterInvalidation?: boolean }): Promise<{ devices: unknown[] }>;
  refreshDevices(): Promise<unknown>;
}

interface P2pContentPort {
  sendCurrentClipboard(): Promise<UnifiedContentResult>;
  sendImportedText(
    text: string,
    profileHash: string,
    options?: ImportedAssetSendOptions
  ): Promise<UnifiedContentResult>;
  sendImportedAsset(
    asset: ImportedContentAsset,
    profileHash: string,
    options?: ImportedAssetSendOptions
  ): Promise<UnifiedContentResult>;
}

interface P2pClipboardPort {
  observeClipboardChange(dispatch: boolean): Promise<SendReport | null>;
  /** What the engine last wrote to the system clipboard, if the platform reports it. */
  lastEngineWrite?(): {
    kind: 'text' | 'file';
    text: string | null;
    size?: number;
    at: number;
  } | null;
  persistDelivery(profileHash: string | undefined, report: SendReport): Promise<void>;
}

export interface P2pSyncAdapterDependencies {
  platform: 'android' | 'ios';
  engine: P2pEnginePort;
  space: P2pSpacePort;
  content: P2pContentPort;
  clipboard: P2pClipboardPort;
}

export class P2pSyncAdapter implements SyncAdapter {
  private recentRemoteArrivals: Array<{ preview: string; truncated: boolean; at: number }> =
    [];
  readonly id = 'p2p' as const;
  private engineEventsUnsubscribe: (() => void) | null = null;
  private policy: SyncRuntimePolicy = {
    appState: 'unknown',
    backgroundSyncEnabled: false,
  };
  private readonly subscribers = new Set<(event: SyncAdapterEvent) => void>();

  constructor(private readonly dependencies: P2pSyncAdapterDependencies) {}

  async start(context: SyncStartContext): Promise<void> {
    this.policy = context.policy;
    this.subscribeToEngineEvents();
    await this.dependencies.engine.start({
      appVersion: context.appVersion,
      profileId: context.profileId,
    });
    await this.refresh(context.policy);
  }

  async refresh(policy: SyncRuntimePolicy): Promise<void> {
    this.policy = policy;
    await this.dependencies.engine.setBackgroundSyncPolicy(policy.backgroundSyncEnabled);
    if (this.dependencies.platform === 'ios') {
      if (policy.appState !== 'active') return;
      await this.dependencies.engine.resume();
    }
    const space = await this.dependencies.space.refresh();
    log.info('P2P space state', { deviceCount: space.devices.length });
    if (policy.appState === 'active') {
      await this.dependencies.engine.notifyConnectivityOpportunity('foreground');
    }
  }

  handleAppStateChange(policy: SyncRuntimePolicy): void {
    this.policy = policy;
  }

  async stop(): Promise<void> {
    this.engineEventsUnsubscribe?.();
    this.engineEventsUnsubscribe = null;
    await this.dependencies.engine.stop();
  }

  subscribe(listener: (event: SyncAdapterEvent) => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  async sendCurrentClipboard(): Promise<SyncAdapterDelivery> {
    return this.mapDelivery(await this.dependencies.content.sendCurrentClipboard());
  }

  async synchronize(): Promise<void> {
    await this.dependencies.engine.refreshPeerConnections();
  }

  async sendImportedText(
    text: string,
    profileHash: string,
    options?: SyncSendOptions
  ): Promise<SyncAdapterDelivery> {
    return this.mapDelivery(
      await this.dependencies.content.sendImportedText(text, profileHash, this.mapOptions(options))
    );
  }

  async sendImportedAsset(
    asset: SyncImportedAsset,
    profileHash: string,
    options?: SyncSendOptions
  ): Promise<SyncAdapterDelivery> {
    return this.mapDelivery(
      await this.dependencies.content.sendImportedAsset(
        asset,
        profileHash,
        this.mapOptions(options)
      )
    );
  }

  async observeClipboardChange(
    content: ClipboardContent,
    dispatch: boolean
  ): Promise<SyncAdapterDelivery | null> {
    let report: SendReport | null;
    if (dispatch && this.policy.appState === 'background') {
      // Android hides the system clipboard from a backgrounded app, so asking
      // the engine to read it cannot succeed. The watcher already captured the
      // content, so hand it to the engine directly.
      log.info('Background clipboard change captured; sending directly:', {
        type: content.type,
        localClipboardHash: content.localClipboardHash?.substring(0, 8),
      });
      report = await this.sendCapturedContent(content);
    } else {
      report = await this.dependencies.clipboard.observeClipboardChange(dispatch);
    }
    if (!report) {
      log.info('Clipboard change produced nothing to send');
      return null;
    }
    await this.dependencies.clipboard.persistDelivery(content.profileHash, report);
    const state = p2pDeliveryStateFromReport(report);
    log.info('Clipboard change sent:', { state });
    return {
      success: state === 'delivered' || state === 'partial',
      state,
      counts: p2pDeliveryCountsFromReport(report),
    };
  }

  private async sendCapturedContent(content: ClipboardContent): Promise<SendReport | null> {
    if (this.isEchoOfRemoteEntry(content)) {
      log.info('Skipping captured clipboard content that was just received from a peer');
      return null;
    }
    const profileHash = content.profileHash ?? '';
    if (content.type === 'Text' && content.text) {
      return (await this.dependencies.content.sendImportedText(content.text, profileHash)).report;
    }
    if (content.type === 'Image' && content.fileUri) {
      return (
        await this.dependencies.content.sendImportedAsset(
          { kind: 'image', uri: content.fileUri, fileName: content.fileName },
          profileHash
        )
      ).report;
    }
    log.info('Captured clipboard content has no sendable payload:', { type: content.type });
    return null;
  }

  /**
   * Content applied to the clipboard by a peer is captured again by the
   * watcher. The engine drops that echo itself when it reads the clipboard,
   * but the direct send path would return it to the peer, so remember what
   * just arrived and skip an exact match for a few seconds.
   */
  private rememberRemoteArrival(preview: string): void {
    const now = Date.now();
    const normalized = normalizePreview(preview);
    this.recentRemoteArrivals = this.recentRemoteArrivals
      .filter((arrival) => now - arrival.at <= REMOTE_ECHO_WINDOW_MS)
      .slice(-REMOTE_ECHO_HISTORY_LIMIT + 1);
    this.recentRemoteArrivals.push({
      preview: normalized.text,
      truncated: normalized.truncated,
      at: now,
    });
  }

  private isEchoOfRemoteEntry(content: ClipboardContent): boolean {
    if (this.isEchoOfEngineWrite(content)) return true;
    if (content.type !== 'Text') return false;
    const now = Date.now();
    const recent = this.recentRemoteArrivals.filter(
      (arrival) => now - arrival.at <= REMOTE_ECHO_WINDOW_MS
    );
    if (recent.length === 0) return false;
    const text = (content.text ?? '').trim();
    if (!text) return false;
    return recent.some((arrival) => {
      if (!arrival.preview) return false;
      return arrival.truncated ? text.startsWith(arrival.preview) : text === arrival.preview;
    });
  }

  /**
   * The engine writes peer content to the system clipboard itself, so the
   * most reliable echo check is comparing against that write directly. It
   * does not depend on the order in which the watcher and the engine report.
   */
  private isEchoOfEngineWrite(content: ClipboardContent): boolean {
    const write = this.dependencies.clipboard.lastEngineWrite?.();
    if (!write || Date.now() - write.at > REMOTE_ECHO_WINDOW_MS) return false;
    if (content.type === 'Text') {
      return write.kind === 'text' && (content.text ?? '') === (write.text ?? '');
    }
    if (content.type === 'Image') {
      if (write.kind !== 'file') return false;
      // Compare sizes when both sides know them so a genuinely new image
      // copied shortly after a peer image is not mistaken for its echo.
      if (write.size != null && write.size >= 0 && content.fileSize != null) {
        return write.size === content.fileSize;
      }
      return true;
    }
    return false;
  }

  private subscribeToEngineEvents(): void {
    if (this.engineEventsUnsubscribe) return;
    this.engineEventsUnsubscribe = this.dependencies.engine.subscribeEvents((event) => {
      this.handleEngineEvent(event);
    });
  }

  private handleEngineEvent(event: EngineEvent): void {
    if (event.type === 'incomingEntry' && event.origin === 'remote') {
      this.rememberRemoteArrival(event.preview);
    }

    if (event.type === 'deviceTrustChanged' || event.type === 'rePairingRequired') {
      if (this.policy.appState === 'active') {
        void this.dependencies.space
          .refresh({ afterInvalidation: true })
          .catch((error) =>
            log.error('Failed to refresh space after a device trust event:', error)
          );
      }
      this.publish({ type: 'configurationChanged' });
      return;
    }

    if (
      event.type === 'refreshRequired' ||
      event.type === 'peerPresenceChanged' ||
      (event.type === 'changed' && event.kind === 'pairing_completed')
    ) {
      if (this.policy.appState === 'active') {
        void this.dependencies.space
          .refreshDevices()
          .catch((error) => log.error('Failed to refresh devices after an engine event:', error));
      }
      this.publish({ type: 'connectionChanged' });
      return;
    }

    if (
      event.type === 'incomingEntry' ||
      event.type === 'incomingPending' ||
      event.type === 'deliveryStatusChanged' ||
      event.type === 'transferStatusChanged' ||
      event.type === 'activeClipboardChanged' ||
      (event.type === 'changed' && event.kind === 'incomingEntry')
    ) {
      this.publish({ type: 'contentChanged' });
      return;
    }

    if (event.type === 'fatal') {
      this.publish({
        type: 'failed',
        message: `${event.failure.category}:${event.failure.code}`,
      });
    }
  }

  private publish(event: SyncAdapterEvent): void {
    for (const subscriber of this.subscribers) subscriber(event);
  }

  private mapOptions(options?: SyncSendOptions): ImportedAssetSendOptions | undefined {
    return options ? { targetDeviceIds: options.targetIds } : undefined;
  }

  private mapDelivery(result: UnifiedContentResult): SyncAdapterDelivery {
    return {
      success: result.success,
      state: result.deliveryState,
      counts: p2pDeliveryCountsFromReport(result.report),
    };
  }
}
