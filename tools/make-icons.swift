// Generates the app icons: swift tools/make-icons.swift
import AppKit

func icon(_ size: Int, rounded: Bool, emojiScale: CGFloat, to path: String) {
    let s = CGFloat(size)
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                               bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let rect = NSRect(x: 0, y: 0, width: s, height: s)
    let bg = rounded ? NSBezierPath(roundedRect: rect, xRadius: s * 0.22, yRadius: s * 0.22) : NSBezierPath(rect: rect)
    NSGradient(starting: NSColor(red: 0.96, green: 0.52, blue: 0.29, alpha: 1),
               ending: NSColor(red: 0.84, green: 0.33, blue: 0.14, alpha: 1))!.draw(in: bg, angle: -90)
    let str = NSAttributedString(string: "🫙", attributes: [.font: NSFont.systemFont(ofSize: s * emojiScale)])
    let sz = str.size()
    str.draw(at: NSPoint(x: (s - sz.width) / 2, y: (s - sz.height) / 2))
    let face = NSAttributedString(string: "😂", attributes: [.font: NSFont.systemFont(ofSize: s * emojiScale * 0.42)])
    let fz = face.size()
    face.draw(at: NSPoint(x: (s - fz.width) / 2, y: (s - fz.height) / 2 - s * emojiScale * 0.1))
    NSGraphicsContext.restoreGraphicsState()
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

icon(192, rounded: true, emojiScale: 0.62, to: "icons/icon-192.png")
icon(512, rounded: true, emojiScale: 0.62, to: "icons/icon-512.png")
icon(512, rounded: false, emojiScale: 0.5, to: "icons/icon-maskable-512.png")
icon(180, rounded: false, emojiScale: 0.6, to: "icons/apple-touch-icon.png")
