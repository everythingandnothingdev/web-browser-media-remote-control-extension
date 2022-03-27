browser = typeof browser !== 'undefined' ? browser : chrome;

browser.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
        if (request.topic === 'mqttStatusChange') {
            updateMqttStatusDisplay(request.data.status, request.data.message);
        }
    }
);

function setFormLoading(isLoading) {
    document.getElementById('mqttSettingsLoader').hidden = !isLoading;
    document.getElementById('mqttSettingsInputs').hidden = isLoading;
}

function updateMqttStatusDisplay(status, message) {
    const statusContainer = document.getElementById('mqttStatus');
    if (status === 'connecting') {
        statusContainer.innerHTML = '<div class="lds-dual-ring"></div><span>Connecting...</span>';
    } else if (status === 'connected') {
        statusContainer.innerHTML = '<div class="status-icon-connected"></div><span>Connected</span>';
    } else if (status === 'reconnecting') {
        statusContainer.innerHTML = '<div class="lds-dual-ring"></div><span>Reconnecting...</span>';
    } else if (status === 'offline') {
        statusContainer.innerHTML = '<div class="status-icon-neutral"></div><span>Offline</span>';
    } else if (status === 'disconnected') {
        statusContainer.innerHTML = '<div class="status-icon-neutral"></div><span>Disconnected</span>';
    } else if (status === 'error') {
        statusContainer.innerHTML = '<div class="status-icon-error"></div><span>' + (message || 'Connection Error') + '</span>';
    }
}

async function loadForm() {
    setFormLoading(true);
    let mqttConfig = {
        protocol: 'ws://',
        host: '',
        port: '',
        username: '',
        password: '',
        topicPrefix: 'webBrowserMediaRemoteControl'
    };
    try {
        const keys = await browser.storage.local.get(['mqttConfig', 'mqttStatus', 'mqttStatusMessage']);
        if (keys.mqttConfig) {
            mqttConfig = JSON.parse(keys.mqttConfig);
        }
        if (keys.mqttStatus) {
            updateMqttStatusDisplay(keys.mqttStatus, keys.mqttStatusMessage);
        }
    } catch (error) {
        // Ignore
    }
    document.getElementById('mqttProtocol').value = mqttConfig.protocol;
    document.getElementById('mqttHost').value = mqttConfig.host;
    document.getElementById('mqttPort').value = mqttConfig.port;
    document.getElementById('mqttUsername').value = mqttConfig.username;
    document.getElementById('mqttPassword').value = mqttConfig.password;
    document.getElementById('mqttTopicPrefix').value = mqttConfig.topicPrefix;
    setFormLoading(false);
}

document.getElementById('form').onsubmit = async () => {
    const protocol = document.getElementById('mqttProtocol').value.trim();
    const host = document.getElementById('mqttHost').value.trim();
    const port = document.getElementById('mqttPort').value.trim();
    const username = document.getElementById('mqttUsername').value.trim();
    const password = document.getElementById('mqttPassword').value.trim();
    const topicPrefix = document.getElementById('mqttTopicPrefix').value.trim();
    if (!host) {
        alert('Host is required.');
        return;
    }
    if (!port) {
        alert('Port is required.');
        return;
    }
    if (!topicPrefix) {
        alert('Topic Prefix is required.');
        return;
    }
    setFormLoading(true);
    let mqttConfig = {
        protocol,
        host,
        port,
        username,
        password,
        topicPrefix
    };
    try {
        await browser.storage.local.set({
            mqttConfig: JSON.stringify(mqttConfig)
        });
        await browser.runtime.sendMessage({
            topic: 'mqttConfigUpdate',
            data: mqttConfig
        });
    } catch (error) {
        alert('An error occurred while updating the configuration.');
    }
    setFormLoading(false);
};

loadForm();