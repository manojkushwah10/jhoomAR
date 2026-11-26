/** User-facing strings (simple English). Add hi.ts with the same keys for Hindi later. */
export const en = {
  viewer: {
    rotateHint: "Drag to rotate · ⇈ ⇊ to see it from above or below · pinch to zoom",
    rotateHintDesktop: "Drag to rotate · scroll to zoom · right-drag to move",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    fromAbove: "See it from above",
    fromBelow: "See it from below",
    reset: "Reset view",
    fullscreen: "Full screen",
    exitFullscreen: "Close full screen",
    load3d: "View in 3D",
    loading: "Loading 3D…",
    error: "The 3D view couldn't load. Please check your internet and try again.",
  },
  ar: {
    button: "View in your room",
    sheetTitle: "How high is your ceiling?",
    sheetHelp: "Pick the closest height. Most homes are 9 or 10 feet.",
    open: "Open camera",
    hintFloor: "Point your camera at the floor below where the jhoomar will hang, then step back and look up.",
    hintSize: "It hangs from your ceiling at real size, above the spot you point at. Swipe left/right to turn it, slide two fingers to move it, pinch to zoom, double-tap to reset. Walk under it and look up to see it from below.",
    hintSizeApp: "It opens at real size. Drag it to move it, twist with two fingers to turn it, pinch to zoom — it snaps back to real size.",
    arScan: "Scan the floor slowly",
    hintLight: "The preview doesn't light up your room.",
    unsupported: "This phone can't show it in your room. You can still rotate it in 3D above.",
    sceneViewerFailed:
      "Google's AR viewer couldn't open. Please update the Google app and install “Google Play Services for AR” from the Play Store, then try again. You can still rotate the jhoomar in 3D above.",
    googleViewerFailed: "Google's AR viewer didn't open on this phone. Tap “Open camera” to see it right here in Chrome.",
    orGoogleViewer: "Or open in Google's AR viewer",
    needsHttps:
      "Android's AR viewer only opens secure (https://) links. Open the website's https link on your phone to use “View in your room”.",
    cancel: "Close",
    qrTitle: "See it in your room",
    qrHelp: "Scan with your phone camera to see this jhoomar hanging at real size in your room.",
  },
  product: {
    enquire: "Enquire on WhatsApp",
    dimensions: "Size",
    diameter: "Diameter",
    height: "Height",
    drop: "Chain (drop) length",
    totalHang: "Total hanging length",
    material: "Material",
    finish: "Finish",
    bulbs: "Bulbs",
    code: "Product code",
    demoNote: "Sample product for the demo — price and details are placeholders.",
  },
} as const

export type Messages = typeof en
