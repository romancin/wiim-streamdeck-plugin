/**
 * Wiim Controller - Stream Deck Plugin v1.0.8
 * Control your WiiM player via local HTTPS API (LinkPlay).
 * Runs as a Node.js plugin (Stream Deck 6.4+).
 */

// Bypass self-signed SSL certificates on WiiM devices
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const WebSocket = require("ws");

// ─── Input source catalog ────────────────────────────────────────────────────

const ALL_SOURCES = [
  { id: "wifi",      label: "WiFi / Streaming", cmd: "setPlayerCmd:switchmode:wifi"      },
  { id: "bluetooth", label: "Bluetooth",         cmd: "setPlayerCmd:switchmode:bluetooth" },
  { id: "linein",    label: "Line In",           cmd: "setPlayerCmd:switchmode:line-in"   },
  { id: "phono",     label: "Phono",             cmd: "setPlayerCmd:switchmode:phono"     },
  { id: "optical",   label: "Optical (TOSLINK)", cmd: "setPlayerCmd:switchmode:optical"   },
  { id: "hdmi",      label: "HDMI ARC",          cmd: "setPlayerCmd:switchmode:HDMI"      },
  { id: "usb",       label: "USB",               cmd: "setPlayerCmd:switchmode:udisk"     },
];

// Models that expose a Phono input (MM). Used to filter ALL_SOURCES for the
// inspector and to guard runtime cycling against stale saved settings.
const PHONO_MODELS = new Set(["WiiM_Ultra"]);

const getSupportedSources = () => {
  const supportsPhono = PHONO_MODELS.has(state.deviceProject);
  return ALL_SOURCES.filter(s => s.id !== "phono" || supportsPhono);
};

// SVG icons for each input source (144x144, white on dark)
const SOURCE_ICONS = {
  wifi: `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="20" fill="#1a1a2e"/><g transform="translate(72,78)" fill="none" stroke="white" stroke-width="5" stroke-linecap="round"><circle cx="0" cy="12" r="4" fill="white" stroke="none"/><path d="M-18,-2 a26,26 0 0,1 36,0" /><path d="M-34,-16 a50,50 0 0,1 68,0" /><path d="M-50,-30 a74,74 0 0,1 100,0" /></g></svg>`,
  bluetooth: `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="20" fill="#1a1a2e"/><g transform="translate(72,72)"><path d="M0,-35 L0,35 M0,-35 L18,-17 L-18,17 M0,35 L18,17 L-18,-17" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`,
  linein: `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="20" fill="#1a1a2e"/><g transform="translate(72,72)" fill="none" stroke="white" stroke-width="5" stroke-linecap="round"><line x1="0" y1="-38" x2="0" y2="-10"/><rect x="-12" y="-10" width="24" height="30" rx="4" fill="none"/><line x1="-8" y1="20" x2="-8" y2="38"/><line x1="8" y1="20" x2="8" y2="38"/></g></svg>`,
  phono: `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="20" fill="#1a1a2e"/><g transform="translate(72,72)" fill="none" stroke="white" stroke-width="4"><circle cx="0" cy="0" r="40"/><circle cx="0" cy="0" r="22"/><circle cx="0" cy="0" r="4" fill="white" stroke="none"/><line x1="24" y1="-34" x2="8" y2="-8" stroke-linecap="round" stroke-width="5"/><circle cx="26" cy="-36" r="4" fill="white" stroke="none"/><rect x="4" y="-12" width="10" height="6" rx="1" fill="white" stroke="none"/></g></svg>`,
  optical: `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="20" fill="#1a1a2e"/><g transform="translate(72,72)" fill="none" stroke="white" stroke-width="5"><rect x="-24" y="-24" width="48" height="48" rx="8"/><circle cx="0" cy="0" r="10"/><circle cx="0" cy="0" r="3" fill="white" stroke="none"/><line x1="-16" y1="-16" x2="-24" y2="-30" stroke-linecap="round"/><line x1="16" y1="-16" x2="24" y2="-30" stroke-linecap="round"/></g></svg>`,
  hdmi: `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="20" fill="#1a1a2e"/><text x="72" y="80" text-anchor="middle" fill="white" font-size="28" font-family="sans-serif" font-weight="bold">HDMI</text></svg>`,
  usb: `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="20" fill="#1a1a2e"/><g transform="translate(72,72)" fill="none" stroke="white" stroke-width="5" stroke-linecap="round"><line x1="0" y1="-38" x2="0" y2="30"/><polygon points="-6,-38 6,-38 0,-48" fill="white" stroke="none"/><circle cx="14" cy="-8" r="6"/><line x1="0" y1="-8" x2="8" y2="-8"/><rect x="8" y="8" width="12" height="10" rx="2" fill="white"/><line x1="0" y1="13" x2="8" y2="13"/><circle cx="0" cy="34" r="8"/></g></svg>`,
};

const getSourceIcon = (sourceId) => {
  const svg = SOURCE_ICONS[sourceId];
  if (!svg) return null;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
};

// Map getPlayerStatus "mode" field to source id. Newer LinkPlay firmwares
// return numeric strings (e.g. "54" = Phono on WiiM Ultra); older ones return
// symbolic names. Both are handled here.
const MODE_TO_ID = {
  wifi: "wifi", wlan: "wifi", airplay: "wifi", spotify: "wifi",
  bluetooth: "bluetooth", bt: "bluetooth",
  "line-in": "linein", linein: "linein",
  optical: "optical", "co-axial": "optical",
  hdmi: "hdmi",
  udisk: "usb", usb: "usb",
  phono: "phono",
  "54": "phono",
};

// ─── Output catalog ─────────────────────────────────────────────────────────

const ALL_OUTPUTS = [
  { id: "optical", hw: 1, label: "Optical (SPDIF)", cmd: "setAudioOutputHardwareMode:1" },
  { id: "lineout", hw: 2, label: "Line Out",        cmd: "setAudioOutputHardwareMode:2" },
  { id: "coaxial", hw: 3, label: "Coaxial",         cmd: "setAudioOutputHardwareMode:3" },
];

const HW_TO_OUTPUT_ID = { 1: "optical", 2: "lineout", 3: "coaxial" };

// SVG icons for each output (144x144, white on dark)
const OUTPUT_ICONS = {
  optical: `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="20" fill="#1a1a2e"/><g transform="translate(72,72)" fill="none" stroke="#e27a4a" stroke-width="5"><rect x="-24" y="-24" width="48" height="48" rx="8"/><circle cx="0" cy="0" r="10"/><circle cx="0" cy="0" r="3" fill="#e27a4a" stroke="none"/></g></svg>`,
  lineout: `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="20" fill="#1a1a2e"/><g transform="translate(72,72)" fill="none" stroke="#e27a4a" stroke-width="5" stroke-linecap="round"><line x1="0" y1="-38" x2="0" y2="-10"/><rect x="-12" y="-10" width="24" height="30" rx="4"/><line x1="-8" y1="20" x2="-8" y2="38"/><line x1="8" y1="20" x2="8" y2="38"/></g></svg>`,
  coaxial: `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="20" fill="#1a1a2e"/><g transform="translate(72,72)" fill="none" stroke="#e27a4a" stroke-width="5"><circle cx="0" cy="0" r="24"/><circle cx="0" cy="0" r="8"/><circle cx="0" cy="0" r="3" fill="#e27a4a" stroke="none"/></g></svg>`,
};

const getOutputIcon = (outputId) => {
  const svg = OUTPUT_ICONS[outputId];
  if (!svg) return null;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
};

// ─── Global state ────────────────────────────────────────────────────────────

const state = {
  wiimIP: null,
  volume: 50,
  isMuted: false,
  isPlaying: false,
  currentTrack: "",
  currentArtist: "",
  currentVendor: "",
  currentAlbumArtURI: "",
  currentAlbumArtB64: null,
  currentAlbumArtRawB64: null,
  currentSourceId: "wifi",
  currentOutputId: "optical",
  deviceProject: "",
  pollInterval: null,
  cycleSettings: {},
  outputCycleSettings: {},
  presets: [],
  presetSettings: {},
  dialSettings: {},
  dialScroll: {},
  marqueeInterval: null,
  contexts: {
    playpause:  new Set(),
    next:       new Set(),
    prev:       new Set(),
    volup:      new Set(),
    voldown:    new Set(),
    mute:       new Set(),
    nowplaying: new Set(),
    inputcycle: new Set(),
    preset:     new Set(),
    outputcycle: new Set(),
    dial:       new Set(),
  },
};

// ─── Command-line arguments (Stream Deck Node.js) ────────────────────────────

const getArg = (key) => {
  const idx = process.argv.indexOf(key);
  return idx !== -1 ? process.argv[idx + 1] : null;
};

const SD_PORT          = getArg("-port");
const SD_PLUGIN_UUID   = getArg("-pluginUUID");
const SD_REGISTER_EVT  = getArg("-registerEvent");

// ─── Localization ────────────────────────────────────────────────────────────

const SD_INFO = (() => { try { return JSON.parse(getArg("-info") || "{}"); } catch { return {}; } })();
const SD_LANG = SD_INFO.application?.language?.startsWith("es") ? "es" : "en";

const I18N = {
  en: {
    noPlayback: "No playback",
    noPreset: "No preset",
    connected: "Connected",
    connectFailed: "Could not connect. Check the IP.",
  },
  es: {
    noPlayback: "Sin reproducción",
    noPreset: "Sin preset",
    connected: "Conectado",
    connectFailed: "No se pudo conectar. Revisa la IP.",
  },
};

const t = (key) => I18N[SD_LANG]?.[key] ?? I18N.en[key] ?? key;

let ws;

// ─── Stream Deck WebSocket ───────────────────────────────────────────────────

const connectStreamDeck = () => {
  ws = new WebSocket(`ws://127.0.0.1:${SD_PORT}`);

  ws.on("open", () => {
    ws.send(JSON.stringify({ event: SD_REGISTER_EVT, uuid: SD_PLUGIN_UUID }));
    ws.send(JSON.stringify({ event: "getGlobalSettings", context: SD_PLUGIN_UUID }));
    log("Wiim Plugin v1.0.8 connected");
  });

  ws.on("message", (raw) => {
    try { handleStreamDeckEvent(JSON.parse(raw.toString())); }
    catch (e) { log("Error parsing message:", e.message); }
  });

  ws.on("close", () => { setTimeout(connectStreamDeck, 2000); });
  ws.on("error", (e) => log("WS error:", e.message));
};

// ─── Event dispatcher ────────────────────────────────────────────────────────

const ACTION_KEY = {
  "com.romancin.wiim.playpause":  "playpause",
  "com.romancin.wiim.next":       "next",
  "com.romancin.wiim.prev":       "prev",
  "com.romancin.wiim.volup":      "volup",
  "com.romancin.wiim.voldown":    "voldown",
  "com.romancin.wiim.mute":       "mute",
  "com.romancin.wiim.nowplaying": "nowplaying",
  "com.romancin.wiim.inputcycle": "inputcycle",
  "com.romancin.wiim.preset":      "preset",
  "com.romancin.wiim.outputcycle": "outputcycle",
  "com.romancin.wiim.dial":        "dial",
};

const handleStreamDeckEvent = ({ event, action, context, payload }) => {
  switch (event) {
    case "keyDown":
      handleKeyDown(action, context, payload);
      break;
    case "dialRotate":
      handleDialRotate(context, payload);
      break;
    case "dialDown":
      handleDialDown(context);
      break;
    case "willAppear":
      registerContext(action, context, payload?.settings);
      break;
    case "willDisappear":
      unregisterContext(action, context);
      break;
    case "didReceiveGlobalSettings":
      applyGlobalSettings(payload?.settings);
      break;
    case "didReceiveSettings":
      applyButtonSettings(action, context, payload?.settings);
      break;
    case "sendToPlugin":
      handleInspectorMessage(action, context, payload);
      break;
  }
};

// ─── Context registration ────────────────────────────────────────────────────

const registerContext = (action, context, settings) => {
  const key = ACTION_KEY[action];
  if (key) state.contexts[key].add(context);
  if (settings?.wiimIP) { state.wiimIP = settings.wiimIP; startPolling(); }
  if (key === "inputcycle" && settings?.enabledSources) {
    state.cycleSettings[context] = settings.enabledSources;
  }
  if (key === "preset" && settings?.presetNumber) {
    state.presetSettings[context] = settings.presetNumber;
  }
  if (key === "outputcycle" && settings?.enabledOutputs) {
    state.outputCycleSettings[context] = settings.enabledOutputs;
  }
  if (key === "dial") {
    const rotateMode = settings?.rotateMode || "volume";
    state.dialSettings[context] = {
      rotateMode,
      volumeStep: settings?.volumeStep || 2,
      scrollText: !!settings?.scrollText,
    };
    setDialLayout(context, rotateMode);
    updateDialFeedback(context);
    syncMarquee();
  }
  sendToStreamDeck({ event: "getSettings", context });
};

const unregisterContext = (action, context) => {
  const key = ACTION_KEY[action];
  if (key) state.contexts[key].delete(context);
  if (key === "inputcycle") delete state.cycleSettings[context];
  if (key === "preset") delete state.presetSettings[context];
  if (key === "outputcycle") delete state.outputCycleSettings[context];
  if (key === "dial") {
    delete state.dialSettings[context];
    delete state.dialScroll[context];
    syncMarquee();
  }
  const total = Object.values(state.contexts).reduce((s, c) => s + c.size, 0);
  if (total === 0 && state.pollInterval) { clearInterval(state.pollInterval); state.pollInterval = null; }
};

const applyButtonSettings = (action, context, settings) => {
  if (!settings) return;
  if (settings.wiimIP) { state.wiimIP = settings.wiimIP; startPolling(); }
  if (ACTION_KEY[action] === "inputcycle" && Array.isArray(settings.enabledSources)) {
    state.cycleSettings[context] = settings.enabledSources;
    updateInputCycleButton(context);
  }
  if (ACTION_KEY[action] === "preset" && settings.presetNumber) {
    state.presetSettings[context] = settings.presetNumber;
    updatePresetButton(context);
  }
  if (ACTION_KEY[action] === "outputcycle" && Array.isArray(settings.enabledOutputs)) {
    state.outputCycleSettings[context] = settings.enabledOutputs;
    updateOutputCycleButton(context);
  }
  if (ACTION_KEY[action] === "dial") {
    const prevMode = state.dialSettings[context]?.rotateMode;
    const rotateMode = settings.rotateMode || "volume";
    state.dialSettings[context] = {
      rotateMode,
      volumeStep: settings.volumeStep || 2,
      scrollText: !!settings.scrollText,
    };
    if (rotateMode !== prevMode) setDialLayout(context, rotateMode);
    updateDialFeedback(context);
    syncMarquee();
  }
};

// ─── Button key presses ──────────────────────────────────────────────────────

const handleKeyDown = async (action, context, payload) => {
  if (!state.wiimIP) { sendToStreamDeck({ event: "showAlert", context }); return; }
  const key = ACTION_KEY[action];
  switch (key) {
    case "playpause": await wiim_togglePlayPause(); break;
    case "next":      await wiimCmd("setPlayerCmd:next"); break;
    case "prev":      await wiimCmd("setPlayerCmd:prev"); break;
    case "volup": {
      const step = payload?.settings?.volumeStep ?? 5;
      await wiim_setVolume(Math.min(100, state.volume + step));
      break;
    }
    case "voldown": {
      const step = payload?.settings?.volumeStep ?? 5;
      await wiim_setVolume(Math.max(0, state.volume - step));
      break;
    }
    case "mute":       await wiim_toggleMute(); break;
    case "inputcycle":  await wiim_cycleInput(context); break;
    case "outputcycle": await wiim_cycleOutput(context); break;
    case "preset": {
      const num = state.presetSettings[context] ?? payload?.settings?.presetNumber;
      if (num) await wiimCmd(`MCUKeyShortClick:${num}`);
      break;
    }
  }
  await updateWiimState();
};

// ─── LinkPlay API ────────────────────────────────────────────────────────────

const wiimCmd = async (command) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(
      `https://${state.wiimIP}/httpapi.asp?command=${command}`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    return await res.text();
  } catch (e) {
    log("Error calling WiiM:", e.message);
    return null;
  }
};

const wiim_togglePlayPause = () =>
  wiimCmd(state.isPlaying ? "setPlayerCmd:pause" : "setPlayerCmd:resume");

const wiim_setVolume = async (vol) => {
  await wiimCmd(`setPlayerCmd:vol:${vol}`);
  state.volume = vol;
};

const wiim_toggleMute = () =>
  wiimCmd(`setPlayerCmd:mute:${state.isMuted ? 0 : 1}`);

const wiim_cycleInput = async (context) => {
  const supportedIds = new Set(getSupportedSources().map(s => s.id));
  const configured   = state.cycleSettings[context] ?? ALL_SOURCES.map(s => s.id);
  const enabledIds   = configured.filter(id => supportedIds.has(id));
  if (enabledIds.length === 0) return;

  const currentIdx = enabledIds.indexOf(state.currentSourceId);
  const nextIdx    = (currentIdx + 1) % enabledIds.length;
  const nextId     = enabledIds[nextIdx];

  const source = ALL_SOURCES.find(s => s.id === nextId);
  if (!source) return;

  await wiimCmd(source.cmd);
  state.currentSourceId = nextId;
  updateInputCycleButton(context);
};

// ─── Output Cycle ───────────────────────────────────────────────────────────

const wiim_cycleOutput = async (context) => {
  const enabledIds = state.outputCycleSettings[context] ?? ALL_OUTPUTS.map(o => o.id);
  if (enabledIds.length === 0) return;

  const currentIdx = enabledIds.indexOf(state.currentOutputId);
  const nextIdx    = (currentIdx + 1) % enabledIds.length;
  const nextId     = enabledIds[nextIdx];

  const output = ALL_OUTPUTS.find(o => o.id === nextId);
  if (!output) return;

  await wiimCmd(output.cmd);
  state.currentOutputId = nextId;
  updateOutputCycleButton(context);
};

const fetchOutputMode = async () => {
  const raw = await wiimCmd("getNewAudioOutputHardwareMode");
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    const hw = parseInt(data.hardware, 10);
    if (HW_TO_OUTPUT_ID[hw]) state.currentOutputId = HW_TO_OUTPUT_ID[hw];
  } catch { /* ignore */ }
};

const updateOutputCycleButton = (context) => {
  const enabledIds = state.outputCycleSettings[context] ?? ALL_OUTPUTS.map(o => o.id);
  const outputId = state.currentOutputId;
  const currentLabel = ALL_OUTPUTS.find(o => o.id === outputId)?.label ?? outputId;

  sendToStreamDeck({ event: "setImage", context, payload: { image: getOutputIcon(outputId), target: 0 } });
  sendToStreamDeck({ event: "setTitle", context, payload: { title: currentLabel, target: 0 } });
};

// ─── Presets ────────────────────────────────────────────────────────────────

const fetchPresets = async () => {
  const raw = await wiimCmd("getPresetInfo");
  log("getPresetInfo raw:", raw);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    log("getPresetInfo parsed:", JSON.stringify(data).slice(0, 500));
    if (Array.isArray(data.preset_list)) {
      state.presets = data.preset_list;
    } else if (Array.isArray(data)) {
      state.presets = data;
    }
    for (const ctx of state.contexts.preset) updatePresetButton(ctx);
  } catch (e) { log("getPresetInfo parse error:", e.message, "raw:", raw.slice(0, 200)); }
};

const updatePresetButton = (context) => {
  const num = state.presetSettings[context];
  if (!num) {
    sendToStreamDeck({ event: "setTitle", context, payload: { title: t("noPreset"), target: 0 } });
    return;
  }
  const preset = state.presets.find(p => p.number === num);
  const label = preset ? preset.name : `Preset ${num}`;
  const source = preset?.source ?? "";
  const title = source ? `${source}\n${label}` : label;
  sendToStreamDeck({ event: "setTitle", context, payload: { title, target: 0 } });
};

// ─── UPnP: Album Art ────────────────────────────────────────────────────────

const UPNP_SOAP_BODY = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:GetPositionInfo xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
    </u:GetPositionInfo>
  </s:Body>
</s:Envelope>`;

const fetchAlbumArtURI = async () => {
  if (!state.wiimIP) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`http://${state.wiimIP}:49152/upnp/control/rendertransport1`, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": '"urn:schemas-upnp-org:service:AVTransport:1#GetPositionInfo"',
      },
      body: UPNP_SOAP_BODY,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const xml = await res.text();
    // albumArtURI lives inside HTML-encoded DIDL-Lite XML within <TrackMetaData>
    const match = xml.match(/&lt;upnp:albumArtURI&gt;([^&]+)&lt;\/upnp:albumArtURI&gt;/)
               || xml.match(/<upnp:albumArtURI>([^<]+)<\/upnp:albumArtURI>/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

const fetchImageAsBase64 = async (url) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") || "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
};

const compositeArtWithVendor = (artDataURI, vendor) => {
  if (!artDataURI) return null;
  if (!vendor) return artDataURI;
  const escaped = vendor.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">
  <image href="${artDataURI}" width="144" height="144"/>
  <rect x="0" y="0" width="144" height="28" rx="0" fill="rgba(0,0,0,0.65)"/>
  <text x="72" y="19" text-anchor="middle" fill="white" font-size="18" font-family="sans-serif" font-weight="500">${escaped}</text>
</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
};

// Wrap album art in an SVG with rounded corners for the Stream Deck + dial,
// plus an optional small service banner overlaid at the bottom. Rounded
// corners are faked with 4 black corner paths so the result works regardless
// of the renderer's clip-path support and blends with the black LCD bg.
const roundedArtWithVendor = (artDataURI, vendor) => {
  if (!artDataURI) return null;
  const r = 14;
  const corners =
    `<path d="M0,0 L${r},0 A${r},${r} 0 0 0 0,${r} Z" fill="#000"/>` +
    `<path d="M100,0 L${100 - r},0 A${r},${r} 0 0 1 100,${r} Z" fill="#000"/>` +
    `<path d="M100,100 L100,${100 - r} A${r},${r} 0 0 1 ${100 - r},100 Z" fill="#000"/>` +
    `<path d="M0,100 L${r},100 A${r},${r} 0 0 1 0,${100 - r} Z" fill="#000"/>`;
  let banner = "";
  if (vendor) {
    const escaped = String(vendor).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    banner =
      `<rect x="0" y="78" width="100" height="22" fill="rgba(0,0,0,0.7)"/>` +
      `<text x="50" y="93" text-anchor="middle" fill="#ffffff" font-size="12" font-family="sans-serif" font-weight="600">${escaped}</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><image href="${artDataURI}" width="100" height="100" preserveAspectRatio="xMidYMid slice"/>${banner}${corners}</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
};

const updateAlbumArt = async () => {
  const artURI = await fetchAlbumArtURI();
  const vendor = state.currentVendor;

  if (artURI === state.currentAlbumArtURI && state.currentAlbumArtB64 !== null) return;
  state.currentAlbumArtURI = artURI || "";

  if (artURI) {
    const rawB64 = await fetchImageAsBase64(artURI);
    state.currentAlbumArtRawB64 = rawB64;
    state.currentAlbumArtB64 = compositeArtWithVendor(rawB64, vendor);
  } else {
    state.currentAlbumArtRawB64 = null;
    state.currentAlbumArtB64 = null;
  }

  for (const ctx of state.contexts.nowplaying) {
    sendToStreamDeck({
      event: "setImage",
      context: ctx,
      payload: { image: state.currentAlbumArtB64 || undefined, target: 0 },
    });
  }

  for (const ctx of state.contexts.dial) updateDialFeedback(ctx);
};

// ─── Polling ─────────────────────────────────────────────────────────────────

const fetchDeviceInfo = async () => {
  const raw = await wiimCmd("getStatusEx");
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    state.deviceProject = data.project ?? data.priv_prj ?? "";
  } catch { /* ignore */ }
};

const startPolling = () => {
  if (state.pollInterval) clearInterval(state.pollInterval);
  fetchDeviceInfo();
  updateWiimState();
  fetchPresets();
  fetchOutputMode();
  state.pollInterval = setInterval(updateWiimState, 3000);
};

const updateWiimState = async () => {
  if (!state.wiimIP) return;
  const raw = await wiimCmd("getPlayerStatus");
  if (!raw) return;
  let data;
  try { data = JSON.parse(raw); } catch { return; }

  state.isPlaying      = data.status === "play";
  state.isMuted        = data.mute === "1";
  state.volume         = parseInt(data.vol ?? state.volume, 10);
  state.currentTrack   = decodeWiimString(data.Title  ?? data.title  ?? "");
  state.currentArtist  = decodeWiimString(data.Artist ?? data.artist ?? "");
  state.currentVendor  = data.vendor ?? "";
  state.currentSourceId = MODE_TO_ID[data.mode?.toLowerCase()] ?? state.currentSourceId;

  updateAllButtons();
  if (state.contexts.nowplaying.size > 0 || state.contexts.dial.size > 0) updateAlbumArt();
};

// ─── Update buttons ──────────────────────────────────────────────────────────

const updateAllButtons = () => {
  for (const ctx of state.contexts.playpause)
    sendToStreamDeck({ event: "setState", context: ctx, payload: { state: state.isPlaying ? 0 : 1 } });

  for (const ctx of state.contexts.mute)
    sendToStreamDeck({ event: "setState", context: ctx, payload: { state: state.isMuted ? 1 : 0 } });

  const trackText = state.currentTrack
    ? truncate(`${state.currentArtist ? state.currentArtist + "\n" : ""}${state.currentTrack}`, 60)
    : (state.currentVendor || t("noPlayback"));
  for (const ctx of state.contexts.nowplaying)
    sendToStreamDeck({ event: "setTitle", context: ctx, payload: { title: trackText, target: 0 } });

  for (const ctx of state.contexts.volup)
    sendToStreamDeck({ event: "setTitle", context: ctx, payload: { title: `🔊\n${state.volume}%`, target: 0 } });
  for (const ctx of state.contexts.voldown)
    sendToStreamDeck({ event: "setTitle", context: ctx, payload: { title: `🔉\n${state.volume}%`, target: 0 } });

  for (const ctx of state.contexts.inputcycle)
    updateInputCycleButton(ctx);

  for (const ctx of state.contexts.preset)
    updatePresetButton(ctx);

  for (const ctx of state.contexts.outputcycle)
    updateOutputCycleButton(ctx);

  for (const ctx of state.contexts.dial)
    updateDialFeedback(ctx);
};

const updateInputCycleButton = (context) => {
  const enabledIds = state.cycleSettings[context] ?? ALL_SOURCES.map(s => s.id);
  const sourceId = state.currentSourceId;
  const currentIdx = enabledIds.indexOf(sourceId);
  const nextId = enabledIds[(currentIdx + 1) % enabledIds.length];
  const currentLabel = ALL_SOURCES.find(s => s.id === sourceId)?.label ?? sourceId;
  const nextLabel = ALL_SOURCES.find(s => s.id === nextId)?.label ?? "";

  const title = currentLabel;

  sendToStreamDeck({ event: "setImage", context, payload: { image: getSourceIcon(sourceId), target: 0 } });
  sendToStreamDeck({ event: "setTitle", context, payload: { title, target: 0 } });
};

// ─── Stream Deck + Dial ─────────────────────────────────────────────────────

const getDialSettings = (context) => state.dialSettings[context] || { rotateMode: "volume", volumeStep: 2 };

const handleDialRotate = async (context, payload) => {
  if (!state.wiimIP) { sendToStreamDeck({ event: "showAlert", context }); return; }
  const ticks = payload?.ticks ?? 0;
  if (!ticks) return;
  const { rotateMode, volumeStep } = getDialSettings(context);

  if (rotateMode === "track") {
    await wiimCmd(ticks > 0 ? "setPlayerCmd:next" : "setPlayerCmd:prev");
  } else {
    const delta = ticks * (volumeStep || 2);
    const next = Math.max(0, Math.min(100, state.volume + delta));
    if (next !== state.volume) await wiim_setVolume(next);
  }
  await updateWiimState();
};

const handleDialDown = async (context) => {
  if (!state.contexts.dial.has(context)) return;
  if (!state.wiimIP) { sendToStreamDeck({ event: "showAlert", context }); return; }
  const { rotateMode } = getDialSettings(context);
  if (rotateMode === "track") await wiim_togglePlayPause();
  else await wiim_toggleMute();
  await updateWiimState();
};

const TITLE_VISIBLE = 13;
const SUBTITLE_VISIBLE = 18;
const MARQUEE_MS = 280;
const MARQUEE_GAP = "   ";

// Loop a marquee view: returns a visible-width window sliding over
// `text + gap`. Returns the full text if it already fits.
const marqueeView = (text, visible, offset) => {
  if (!text || text.length <= visible) return text;
  const padded = text + MARQUEE_GAP;
  const start = offset % padded.length;
  const doubled = padded + padded;
  return doubled.substring(start, start + visible);
};

const anyDialNeedsScroll = () =>
  [...state.contexts.dial].some(ctx => state.dialSettings[ctx]?.scrollText);

const startMarquee = () => {
  if (state.marqueeInterval) return;
  state.marqueeInterval = setInterval(tickMarquee, MARQUEE_MS);
};

const stopMarquee = () => {
  if (!state.marqueeInterval) return;
  clearInterval(state.marqueeInterval);
  state.marqueeInterval = null;
};

const syncMarquee = () => {
  if (anyDialNeedsScroll()) startMarquee();
  else stopMarquee();
};

const tickMarquee = () => {
  const trackKey = `${state.currentTrack}|${state.currentArtist}`;
  for (const ctx of state.contexts.dial) {
    const s = state.dialSettings[ctx];
    if (!s?.scrollText) continue;
    const scroll = (state.dialScroll[ctx] ||= { offset: 0, lastKey: "" });
    if (scroll.lastKey !== trackKey) { scroll.offset = 0; scroll.lastKey = trackKey; }
    scroll.offset += 1;
    updateDialFeedback(ctx, { includeIcon: false });
  }
};

const dialLayoutPath = (rotateMode) =>
  rotateMode === "track"
    ? "layouts/wiim-dial-track.json"
    : "layouts/wiim-dial-volume.json";

const setDialLayout = (context, rotateMode) => {
  sendToStreamDeck({
    event: "setFeedbackLayout",
    context,
    payload: { layout: dialLayoutPath(rotateMode) },
  });
};

const updateDialFeedback = (context, opts = {}) => {
  if (!state.contexts.dial.has(context)) return;
  const { includeIcon = true } = opts;
  const { rotateMode, scrollText } = getDialSettings(context);

  const fullTitle = state.currentTrack || state.currentVendor || t("noPlayback");
  const fullArtist = state.currentArtist || "";
  const offset = state.dialScroll[context]?.offset ?? 0;

  const title = scrollText
    ? marqueeView(fullTitle, TITLE_VISIBLE, offset)
    : truncate(fullTitle, 18);
  const subtitle = scrollText
    ? marqueeView(fullArtist, SUBTITLE_VISIBLE, offset)
    : truncate(fullArtist, 24);

  const payload = { title, value: subtitle };

  if (includeIcon) {
    payload.icon = state.currentAlbumArtRawB64
      ? roundedArtWithVendor(state.currentAlbumArtRawB64, state.currentVendor)
      : getDialPlaceholderIcon();
  }

  if (rotateMode === "track") {
    payload.arrows = "◀   ▶";
  } else {
    payload.percent = state.isMuted ? `🔇 ${state.volume}%` : `${state.volume}%`;
    payload.indicator = state.volume;
  }

  sendToStreamDeck({ event: "setFeedback", context, payload });
};

const DIAL_PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="14" ry="14" fill="#1a1a2e"/><g transform="translate(50,50)" fill="none" stroke="#4a4a6e" stroke-width="3"><circle r="28"/><circle r="14"/><circle r="3" fill="#4a4a6e" stroke="none"/></g></svg>`;
const getDialPlaceholderIcon = () =>
  "data:image/svg+xml;charset=utf-8," + encodeURIComponent(DIAL_PLACEHOLDER);

// ─── Property Inspector messages ─────────────────────────────────────────────

const handleInspectorMessage = (action, context, payload) => {
  if (!payload) return;

  if (payload.event === "saveSettings") {
    const { wiimIP, volumeStep, enabledSources } = payload;
    sendToStreamDeck({
      event: "setGlobalSettings",
      context: SD_PLUGIN_UUID,
      payload: { wiimIP, volumeStep },
    });
    sendToStreamDeck({ event: "setSettings", context, payload: { wiimIP, volumeStep, enabledSources } });
    state.wiimIP = wiimIP;
    if (Array.isArray(enabledSources)) state.cycleSettings[context] = enabledSources;
    startPolling();
  }

  if (payload.event === "testConnection") {
    testWiimConnection(action, context, payload.wiimIP);
  }

  // Inspector requests the source catalog to render checkboxes. We send only
  // sources supported by the connected device (e.g. Phono is hidden unless the
  // model is a WiiM Ultra). If we haven't detected the model yet, fetch it now
  // so the inspector opens with the correct list.
  if (payload.event === "getSources") {
    const respond = () => sendToPropertyInspector(action, context, {
      event: "sourceCatalog",
      sources: getSupportedSources().map(s => ({ id: s.id, label: s.label })),
      currentSourceId: state.currentSourceId,
    });
    if (!state.deviceProject && state.wiimIP) fetchDeviceInfo().then(respond);
    else respond();
  }

  // Preset inspector requests available presets
  if (payload.event === "getPresets") {
    fetchPresets().then(() => {
      sendToPropertyInspector(action, context, {
        event: "presetCatalog",
        presets: state.presets,
        count: state.presets.length,
      });
    });
  }

  // Output inspector requests the output catalog
  if (payload.event === "getOutputs") {
    fetchOutputMode().then(() => {
      sendToPropertyInspector(action, context, {
        event: "outputCatalog",
        outputs: ALL_OUTPUTS.map(o => ({ id: o.id, label: o.label })),
        currentOutputId: state.currentOutputId,
      });
    });
  }

  // Output inspector saves settings
  if (payload.event === "saveOutputSettings") {
    const { wiimIP, enabledOutputs } = payload;
    sendToStreamDeck({
      event: "setGlobalSettings",
      context: SD_PLUGIN_UUID,
      payload: { wiimIP },
    });
    sendToStreamDeck({ event: "setSettings", context, payload: { wiimIP, enabledOutputs } });
    state.wiimIP = wiimIP;
    if (Array.isArray(enabledOutputs)) state.outputCycleSettings[context] = enabledOutputs;
    startPolling();
  }

  // Dial inspector saves settings
  if (payload.event === "saveDialSettings") {
    const { wiimIP, rotateMode, volumeStep, scrollText } = payload;
    const mode = rotateMode || "volume";
    sendToStreamDeck({
      event: "setGlobalSettings",
      context: SD_PLUGIN_UUID,
      payload: { wiimIP, volumeStep },
    });
    sendToStreamDeck({
      event: "setSettings",
      context,
      payload: { wiimIP, rotateMode: mode, volumeStep, scrollText: !!scrollText },
    });
    state.wiimIP = wiimIP;
    state.dialSettings[context] = {
      rotateMode: mode,
      volumeStep: volumeStep || 2,
      scrollText: !!scrollText,
    };
    if (!scrollText) state.dialScroll[context] = { offset: 0, lastKey: "" };
    startPolling();
    setDialLayout(context, mode);
    updateDialFeedback(context);
    syncMarquee();
  }

  // Preset inspector saves settings
  if (payload.event === "savePresetSettings") {
    const { wiimIP, presetNumber } = payload;
    sendToStreamDeck({
      event: "setGlobalSettings",
      context: SD_PLUGIN_UUID,
      payload: { wiimIP },
    });
    sendToStreamDeck({ event: "setSettings", context, payload: { wiimIP, presetNumber } });
    state.wiimIP = wiimIP;
    if (presetNumber) state.presetSettings[context] = presetNumber;
    startPolling();
  }
};

const testWiimConnection = async (action, context, ip) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://${ip}/httpapi.asp?command=getStatusEx`, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();
    const name = data.DeviceName ?? data.devicename ?? "Wiim";
    sendToPropertyInspector(action, context, { event: "testResult", success: true, message: `✅ ${t("connected")}: ${name}` });
  } catch {
    sendToPropertyInspector(action, context, { event: "testResult", success: false, message: `❌ ${t("connectFailed")}` });
  }
};

const applyGlobalSettings = (settings) => {
  if (!settings) return;
  if (settings.wiimIP) { state.wiimIP = settings.wiimIP; startPolling(); }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const decodeWiimString = (str) => {
  if (!str) return "";
  if (/^[0-9a-fA-F]+$/.test(str) && str.length % 2 === 0) {
    try {
      const bytes = str.match(/.{2}/g).map(h => parseInt(h, 16));
      return Buffer.from(bytes).toString("utf-8");
    } catch { return str; }
  }
  return str;
};

const truncate = (str, max) => str.length > max ? str.slice(0, max - 1) + "…" : str;
const log = (...a) => console.log("[Wiim]", ...a);

const sendToStreamDeck = (obj) => {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
};

const sendToPropertyInspector = (action, context, payload) =>
  sendToStreamDeck({ event: "sendToPropertyInspector", action, context, payload });

// ─── Startup ─────────────────────────────────────────────────────────────────

connectStreamDeck();
