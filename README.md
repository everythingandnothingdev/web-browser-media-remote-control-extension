# web-browser-media-remote-control-extension

If you have a desktop computer connected to your living room TV and are looking for a media center interface while browsing the web, this is for you.

This Firefox/Chrome extension allows the corresponding smartphone app (web-browser-media-remote-control-app) to control web pages with a TV remote-like interface.

This is an alternative setup to something like Kodi if most of the media content you consume is on the web (such as youtube.com), and you don't want to deal with the restrictions associated with pulling that experience out of the web browser (setting up API keys, rate limiting, etc). Also with this setup, you can visit any website, you don't have to wait for someone to develop an addon for a specific website you use.

## Setup

You are required to set up a MQTT broker for this extension to communicate with your phone. I personally have an instance of [Home Assistant](https://www.home-assistant.io/) running on one of my computers for other home automation purposes, and it has the [Mosquitto Broker addon](https://github.com/home-assistant/addons/blob/master/mosquitto/DOCS.md) installed. This is a simple, non-technical setup, and the following instructions assume the defaults for that setup. However, you can just as easily set up a [standalone MQTT server](https://mosquitto.org/) or use a cloud service that provides MQTT if you wish.

After your MQTT Broker is up and running, you must set up the MQTT Broker credentials in this web extension's settings.

Example:

```
Host: 192.168.1.20
Port: 1884
Username: mqtt_username
Password: mqtt_password
```

The host will be the local IP address of the computer you set up the MQTT broker on, you'll need to check your router settings to find this. The port is whichever port supports the "ws://" protocol (note, NOT the "mqtt://" protocol!). On the Mosquitto Broker addon for Home Assistant the default port for this is 1884.

### For Firefox

Save yourself a lot of trouble by opening about:config and changing `media.autoplay.default` to `0`. The remote control won't be able to start/stop videos on newly visited pages otherwise.
