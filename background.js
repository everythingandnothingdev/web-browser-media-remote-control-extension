let mqttClient; // current mqtt client instance
browser = typeof browser !== 'undefined' ? browser : chrome;

let mqttConfig = {
    protocol: 'ws://',
    host: '',
    port: '',
    username: '',
    password: '',
    topicPrefix: 'webBrowserMediaRemoteControl'
};

let openedTabs = [];

browser.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
        if (request.topic === 'mqttConfigUpdate') {
            mqttConnect(request.data);
        } else if (request.topic === 'mqttSend') {
            if (mqttClient) {
                mqttClient.publish(mqttConfig.topicPrefix + '/' + request.mqtt?.topic, JSON.stringify(request.mqtt?.message));
            }
        }
    }
);

browser.tabs.onActivated.addListener(
    ({previousTabId, tabId, windowId}) => {
        let previousTab = openedTabs.filter(existingTab => existingTab.id === previousTabId)[0];
        if (previousTab) {
            previousTab.active = false;
        }
        let newTab = openedTabs.filter(existingTab => existingTab.id === tabId)[0];
        if (newTab) {
            newTab.active = true;
        } else {
            rebuildTabList();
            return;
        }
        if (mqttClient) {
            mqttClient.publish(mqttConfig.topicPrefix + '/tabs/list', JSON.stringify(openedTabs));
        }
    }
);
browser.tabs.onCreated.addListener(
    (newTab) => {
        let existingTab = openedTabs.filter(tab => tab.id === newTab.id)[0];
        if (!existingTab) {
            openedTabs.push({
                id: newTab.id,
                active: newTab.active,
                url: newTab.url,
                title: newTab.title
            });
        }
        if (mqttClient) {
            mqttClient.publish(mqttConfig.topicPrefix + '/tabs/list', JSON.stringify(openedTabs));
        }
    }
);
browser.tabs.onRemoved.addListener(
    (tabId, removeInfo) => {
        let existingTabIndex = openedTabs.indexOf(openedTabs.filter(existingTab => existingTab.id === tabId)[0]);
        if (existingTabIndex > -1) {
            openedTabs.splice(existingTabIndex, 1);
        }
        if (mqttClient) {
            mqttClient.publish(mqttConfig.topicPrefix + '/tabs/list', JSON.stringify(openedTabs));
        }
    }
);
browser.tabs.onUpdated.addListener(
    (tabId, changeInfo, tab) => {
        let existingTab = openedTabs.filter(existingTab => existingTab.id === tabId)[0];
        if (!existingTab) {
            openedTabs.push({
                id: newTab.id,
                active: newTab.active,
                url: newTab.url,
                title: newTab.title
            });
        } else {
            existingTab.active = tab.active;
            existingTab.url = tab.url;
            existingTab.title = tab.title;
        }
        if (mqttClient) {
            mqttClient.publish(mqttConfig.topicPrefix + '/tabs/list', JSON.stringify(openedTabs));
        }
    }
);
async function rebuildTabList() {
    return new Promise((resolve) => {
        browser.tabs.query({}, (tabs) => {
            openedTabs = [];
            for (const tab of tabs) {
                openedTabs.push({
                    id: tab.id,
                    active: tab.active,
                    url: tab.url,
                    title: tab.title
                });
            }
            if (mqttClient) {
                mqttClient.publish(mqttConfig.topicPrefix + '/tabs/list', JSON.stringify(openedTabs));
            }
        });
    });
}

function consolePrefix() {
    return '[browser-media-remote-control] ' + new Date().toISOString() + ': ';
}

async function notifyMqttStatus(status, message) {
    try {
        await browser.storage.local.set({
            mqttStatus: status,
            mqttStatusMessage: (message || '').toString()
        });
        await browser.runtime.sendMessage({
            topic: 'mqttStatusChange',
            data: {
                status,
                message
            }
        });
    } catch (error) {}
    switch (status) {
        case 'connecting':
            console.log(consolePrefix() + 'MQTT Connecting...');
            break;
        case 'connected':
            console.log(consolePrefix() + 'MQTT Connected!');
            break;
        case 'reconnecting':
            console.log(consolePrefix() + 'MQTT Reconnecting...');
            break;
        case 'offline':
            console.log(consolePrefix() + 'MQTT Offline.');
            break;
        case 'disconnected':
            console.log(consolePrefix() + 'MQTT Disconnected.');
            break;
        case 'error':
            console.warn(consolePrefix() + 'MQTT Couldn\'t connect.', message);
            break;
    }
}

function urlify(url) {
    if (!/^https?:\/\//g.test(url)) {
        url = 'http://' + url;
    }
    return url;
}

function mqttConnect(mqttConfig) {
    if (mqttClient) {
        console.log(consolePrefix() + 'Ending current MQTT client.');
        mqttClient.end();
    }
    notifyMqttStatus('connecting');
    mqttClient = mqtt.connect(mqttConfig.protocol + mqttConfig.host, { 
        port: parseInt(mqttConfig.port, 10),
        username: mqttConfig.username,
        password: mqttConfig.password
    });
    mqttClient.on('connect', async () => {
        notifyMqttStatus('connected');
        await new Promise((resolve, reject) => {
            mqttClient.subscribe(mqttConfig.topicPrefix + '/#', (err) => {
                if (err) {
                    console.warn(consolePrefix() + 'Couldn\'t subscribe to mqtt topic.', err);
                    mqttClient.end();
                    reject();
                } else {
                    resolve();
                }
            });
        });
        await rebuildTabList();
    });
    mqttClient.on('reconnect', () => {
        notifyMqttStatus('reconnecting');
    });
    mqttClient.on('offline', () => {
        notifyMqttStatus('offline');
    });
    mqttClient.on('error', (err) => {
        notifyMqttStatus('error', err);
        mqttClient.end();
    });
    mqttClient.on('close', (err) => {
        notifyMqttStatus('disconnected');
    });
    mqttClient.on('message', (topic, message) => {
        console.log(consolePrefix() + topic, message.toString());

        topic = topic.replace(mqttConfig.topicPrefix + '/', '');
        message = JSON.parse(message);

        if (topic === 'tabs/requestList') {
            mqttClient.publish(mqttConfig.topicPrefix + '/tabs/list', JSON.stringify(openedTabs));
        } else if (topic === 'tabs/activate') {
            browser.tabs.update(message.id, { active: true });
        } else if (topic === 'tabs/create') {
            browser.tabs.create({ url: urlify(message.url) });
        } else if (topic === 'tabs/remove') {
            browser.tabs.remove(message.id);
            // Sometimes not removed by event for some reason.
            let existingTabIndex = openedTabs.indexOf(openedTabs.filter(existingTab => existingTab.id === message.id)[0]);
            if (existingTabIndex > -1) {
                openedTabs.splice(existingTabIndex, 1);
            }
        } else if (topic === 'tabs/update') {
            browser.tabs.update(message.id, { url: urlify(message.url) });
        } else if (topic === 'tabs/zoomIn') {
            browser.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
                const zoom = await browser.tabs.getZoom(tabs[0].id);
                browser.tabs.setZoom(tabs[0].id, Math.floor(zoom * 10 + 1) / 10);
            });
        } else if (topic === 'tabs/zoomOut') {
            browser.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
                const zoom = await browser.tabs.getZoom(tabs[0].id);
                browser.tabs.setZoom(tabs[0].id, Math.floor(zoom * 10 - 1) / 10);
            });
        } else if (topic === 'window/fullscreen') {
            browser.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
                const existingWindow = await browser.windows.get(tabs[0].windowId);
                browser.windows.update(existingWindow.id, { state: 'fullscreen' });
            });
        } else if (topic === 'window/maximized') {
            browser.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
                browser.windows.update(existingWindow.id, { state: 'maximized' });
            });
        }

        browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            browser.tabs.sendMessage(tabs[0].id, {
                topic: 'mqttReceive',
                mqtt: {
                    topic,
                    message: message,
                }
            });
        });
    });
}

async function initialSetup() {
    await notifyMqttStatus('disconnected');
    try {
        const keys = await browser.storage.local.get("mqttConfig");
        if (keys.mqttConfig) {
            mqttConfig = JSON.parse(keys.mqttConfig);
        }
    } catch (error) {
        // Ignore
    }
    if (!mqttConfig.host || !mqttConfig.port || !mqttConfig.topicPrefix) {
        browser.runtime.openOptionsPage();
    } else {
        mqttConnect(mqttConfig);
    }
}

initialSetup();
