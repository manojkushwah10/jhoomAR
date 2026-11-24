/** User-facing strings (simple English). Add hi.ts with the same keys for Hindi later. */
export const en = {
  viewer: {
    rotateHint: "Drag to rotate · pinch to zoom",
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
    hintSize: "It is shown at its real size and can't be stretched.",
    hintLight: "The preview doesn't light up your room.",
    unsupported: "This phone can't show it in your room. You can still rotate it in 3D above.",
    sceneViewerFailed:
      "Google's AR viewer couldn't open. Please update the Google app and install “Google Play Services for AR” from the Play Store, then try again. You can still rotate the jhoomar in 3D above.",
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
