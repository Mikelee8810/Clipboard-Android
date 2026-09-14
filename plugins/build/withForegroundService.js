"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_plugins_1 = require("expo/config-plugins");
const withForegroundService = (config) => {
    return (0, config_plugins_1.withAndroidManifest)(config, (modConfig) => {
        const manifest = modConfig.modResults.manifest;
        // Add FOREGROUND_SERVICE permission
        if (!manifest['uses-permission']) {
            manifest['uses-permission'] = [];
        }
        const permissions = manifest['uses-permission'];
        const addPermission = (name) => {
            if (!permissions.some((p) => p.$?.['android:name'] === name)) {
                permissions.push({ $: { 'android:name': name } });
                console.log(`✅ Added permission: ${name}`);
            }
        };
        addPermission('android.permission.FOREGROUND_SERVICE');
        addPermission('android.permission.FOREGROUND_SERVICE_SPECIAL_USE');
        // Register Service in <application>
        const application = manifest.application?.[0];
        if (application) {
            if (!application.service) {
                application.service = [];
            }
            const serviceClassName = 'expo.modules.foregroundservice.SyncForegroundService';
            let service = application.service.find((s) => s.$?.['android:name'] === serviceClassName);
            if (!service) {
                service = {
                    $: {
                        'android:name': serviceClassName,
                        'android:enabled': 'true',
                        'android:exported': 'false',
                        'android:foregroundServiceType': 'specialUse',
                    },
                };
                application.service.push(service);
                console.log(`✅ Registered service: ${serviceClassName}`);
            }
            service.$ = {
                ...(service.$ ?? {}),
                'android:foregroundServiceType': 'specialUse',
            };
            service.property = [
                {
                    $: {
                        'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
                        'android:value': 'continuously capture user-authorized clipboard history',
                    },
                },
            ];
        }
        return modConfig;
    });
};
exports.default = withForegroundService;
