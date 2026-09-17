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

/** How long a peer-applied entry is still treated as the source of a captured echo. */
const REMOTE_ECHO_WINDOW_MS = 2 * 60 * 1000;
/** Images carry no comparable preview, so only a short window after an arrival counts. */
const REMOTE_IMAGE_ECHO_WINDOW_MS = 20 * 1000;
const REMOTE_ECHO_HISTORY_LIMIT = 10;
const DEFAULT_CAPTURE_SETTLE_MS = 1500;

/** Engine previews may be trimmed and end with an ellipsis; compare on the stable prefix. */
function normalizePreview(value: string): string {
  return value.replace(/(\u2026|\.\.\.)\s*$/u, '').trim();
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
  persistDelivery(profileHash: string | undefined, report: SendReport): Promise<void>;
}

export interface P2pSyncAdapterDependencies {
  platform: 'android' | 'ios';
  /** How long a captured clipboard change waits for a matching peer report before it is sent. */
  captureSettleMs?: number;
  engine: P2pEnginePort;
  space: P2pSpacePort;
  content: P2pContentPort;
  clipboard: P2pClipboardPort;
}

export class P2pSyncAdapter implements SyncAdapter {
  private recentRemoteArrivals: Array<{ preview: string; at: number }> = [];
  private readonly captureSettleMs: number;
  readonly id = 'p2p' as const;
  private engineEventsUnsubscribe: (() => void) | null = null;
  private policy: SyncRuntimePolicy = {
    appState: 'unknown',
    backgroundSyncEnabled: false,
  };
  private readonly subscribers = new Set<(event: SyncAdapterEvent) => void>();

  constructor(private readonly dependencies: P2pSyncAdapterDependencies) {
    this.captureSettleMs = dependencies.captureSettleMs ?? DEFAULT_CAPTURE_SETTLE_MS;
  }

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
    let report = await this.dependencies.clipboard.observeClipboardChange(dispatch);
    if (!report && dispatch) {
      // Android hides the system clipboard from a backgrounded app, so the
      // engine sees nothing to send. Shizuku already captured the content, so
      // hand it to the engine directly.
      report = await this.sendCapturedContent(content);
    }
    if (!report) return null;
    await this.dependencies.clipboard.persistDelivery(content.profileHash, report);
    const state = p2pDeliveryStateFromReport(report);
    return {
      success: state === 'delivered' || state === 'partial',
      state,
      counts: p2pDeliveryCountsFromReport(report),
    };
  }

  private async sendCapturedContent(content: ClipboardContent): Promise<SendReport | null> {
    // The watcher fires before the engine reports the entry it just applied,
    // so give that report a moment to land before deciding this is a real copy.
    if (!this.isEchoOfRemoteEntry(content)) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.captureSettleMs));
    }
    if (this.isEchoOfRemoteEntry(content)) {
      log.debug('Skipping captured clipboard content that was just received from a peer');
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
    return null;
  }

  /**
   * Content applied to the clipboard by a peer is captured again by the
   * Shizuku watcher. The engine drops that echo itself, but the captured-
   * content fallback would send it straight back, so remember what recently
   * arrived and never re-send it.
   */
  private rememberRemoteArrival(preview: string): void {
    const now = Date.now();
    this.recentRemoteArrivals = this.recentRemoteArrivals
      .filter((arrival) => now - arrival.at <= REMOTE_ECHO_WINDOW_MS)
      .slice(-REMOTE_ECHO_HISTORY_LIMIT + 1);
    this.recentRemoteArrivals.push({ preview: normalizePreview(preview), at: now });
  }

  private isEchoOfRemoteEntry(content: ClipboardContent): boolean {
    const now = Date.now();
    const recent = this.recentRemoteArrivals.filter(
      (arrival) => now - arrival.at <= REMOTE_ECHO_WINDOW_MS
    );
    if (recent.length === 0) return false;
    if (content.type === 'Text') {
      const text = normalizePreview(content.text ?? '');
      if (!text) return false;
      return recent.some(
        (arrival) => arrival.preview.length > 0 && text.startsWith(arrival.preview)
      );
    }
    if (content.type === 'Image') {
      return recent.some((arrival) => now - arrival.at <= REMOTE_IMAGE_ECHO_WINDOW_MS);
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
