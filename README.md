# WiiM Controller for Stream Deck

Control your [WiiM](https://wiimhome.com) audio player directly from your Elgato Stream Deck.

## Features

- **Play / Pause** — toggle playback
- **Next / Previous Track** — skip tracks
- **Volume Up / Down** — adjustable step size (1–20%)
- **Mute / Unmute** — toggle audio mute
- **Now Playing** — displays album art, artist, track title, and streaming service (Tidal, Spotify, Plex, etc.)
- **Input Cycle** — cycle through configured inputs (WiFi, Bluetooth, Line In, Optical, HDMI, USB) with dynamic icons

## Requirements

- Elgato Stream Deck software **6.4+** (Node.js plugin support)
- A WiiM device on your local network (WiiM Mini, Pro, Pro Plus, Ultra, Amp, etc.)

## Installation

1. Download the latest `com.wiim.streamdeck.streamDeckPlugin` from [Releases](../../releases)
2. Double-click the file to install
3. In the Stream Deck app, find **Wiim Controller** in the action list
4. Drag an action to your deck
5. In the Property Inspector, enter your WiiM device's IP address and click **Test Connection**

### Finding your WiiM IP

Open the **WiiM Home** app → tap your device → Settings → Device Information → copy the IP address.

## Localization

The plugin automatically uses your OS language:
- **English** (default)
- **Spanish** (Español)

## How it works

The plugin communicates with your WiiM device over:
- **HTTPS** (LinkPlay API) — for playback control, volume, mute, input switching, and device status polling
- **UPnP/SOAP** (port 49152) — for album art retrieval from track metadata

Status is polled every 3 seconds when any action is active on the deck.

## Building from source

```bash
cd com.wiim.streamdeck.sdPlugin
npm install --production
cd ..
zip -r com.wiim.streamdeck.streamDeckPlugin com.wiim.streamdeck.sdPlugin/ -x "*.DS_Store"
```

Or simply push a version tag to trigger the GitHub Actions release workflow:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## License

[MIT](LICENSE)
