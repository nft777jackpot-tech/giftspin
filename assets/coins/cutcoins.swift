// Вырезает монеты с белого или «шахматного» фона: заливка фона от краёв, затем компоненты связности, кадрирование, PNG
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
let src = URL(fileURLWithPath: args[1])
let outDir = URL(fileURLWithPath: args[2])
let names = args[3].split(separator: ",").map(String.init) // в порядке: сверху вниз, слева направо
let maxSide = Int(args[4]) ?? 256

guard let isrc = CGImageSourceCreateWithURL(src as CFURL, nil), let img = CGImageSourceCreateImageAtIndex(isrc, 0, nil) else { fatalError("read") }
let w = img.width, h = img.height
var px = [UInt8](repeating: 0, count: w * h * 4)
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))

func isBg(_ i: Int) -> Bool {
  if px[i * 4 + 3] < 24 { return true } // уже прозрачный фон
  let r = Int(px[i * 4]), g = Int(px[i * 4 + 1]), b = Int(px[i * 4 + 2])
  return min(r, g, b) > 185 && max(r, g, b) - min(r, g, b) < 22
}
// Заливка фона от всех краёв
var bg = [Bool](repeating: false, count: w * h)
var stack: [Int] = []
for x in 0..<w { stack.append(x); stack.append((h - 1) * w + x) }
for y in 0..<h { stack.append(y * w); stack.append(y * w + w - 1) }
while let i = stack.popLast() {
  if bg[i] || !isBg(i) { continue }
  bg[i] = true
  let x = i % w, y = i / w
  if x > 0 { stack.append(i - 1) }
  if x < w - 1 { stack.append(i + 1) }
  if y > 0 { stack.append(i - w) }
  if y < h - 1 { stack.append(i + w) }
}
// Светлая кайма на границе с фоном — полупрозрачная, чтобы не было белого ореола
for _ in 0..<2 {
  var edge: [Int] = []
  for y in 1..<(h - 1) { for x in 1..<(w - 1) {
    let i = y * w + x
    if bg[i] { continue }
    if bg[i - 1] || bg[i + 1] || bg[i - w] || bg[i + w] {
      let r = Int(px[i * 4]), g = Int(px[i * 4 + 1]), b = Int(px[i * 4 + 2])
      if min(r, g, b) > 140 { edge.append(i) }
    }
  } }
  for i in edge { bg[i] = true }
}
for i in 0..<(w * h) where bg[i] { px[i * 4] = 0; px[i * 4 + 1] = 0; px[i * 4 + 2] = 0; px[i * 4 + 3] = 0 }

// Компоненты связности непрозрачных пикселей
var label = [Int32](repeating: -1, count: w * h)
struct Box { var x0: Int, y0: Int, x1: Int, y1: Int, n: Int }
var boxes: [Box] = []
for start in 0..<(w * h) where !bg[start] && label[start] < 0 {
  let id = Int32(boxes.count)
  var b = Box(x0: w, y0: h, x1: 0, y1: 0, n: 0)
  stack = [start]
  label[start] = id
  while let i = stack.popLast() {
    let x = i % w, y = i / w
    b.x0 = min(b.x0, x); b.y0 = min(b.y0, y); b.x1 = max(b.x1, x); b.y1 = max(b.y1, y); b.n += 1
    for j in [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1] where j >= 0 && !bg[j] && label[j] < 0 {
      label[j] = id
      stack.append(j)
    }
  }
  boxes.append(b)
}
var coins = boxes.enumerated().filter { $0.element.n > 20000 }
// Строки по центру: сверху вниз, внутри строки слева направо
coins.sort { a, b in
  let ay = (a.element.y0 + a.element.y1) / 2, by = (b.element.y0 + b.element.y1) / 2
  if abs(ay - by) > 150 { return ay < by }
  return a.element.x0 < b.element.x0
}
print("найдено монет:", coins.count, "мелких кусков отброшено:", boxes.count - coins.count)
for c in coins { let b = c.element; FileHandle.standardError.write("box \(b.x0),\(b.y0)-\(b.x1),\(b.y1) n=\(b.n)\n".data(using: .utf8)!) }
guard coins.count == names.count else { FileHandle.standardError.write("ожидалось \(names.count)\n".data(using: .utf8)!); exit(1) }

let full = ctx.makeImage()!
for (k, c) in coins.enumerated() {
  let b = c.element
  // Оставляем только пиксели своей компоненты, чтобы соседняя монета не попала в кадр
  let cw = b.x1 - b.x0 + 1, ch = b.y1 - b.y0 + 1
  var sub = [UInt8](repeating: 0, count: cw * ch * 4)
  for y in 0..<ch { for x in 0..<cw {
    let i = (b.y0 + y) * w + (b.x0 + x)
    if label[i] == Int32(c.offset) { for q in 0..<4 { sub[(y * cw + x) * 4 + q] = px[i * 4 + q] } }
  } }
  let subCtx = CGContext(data: &sub, width: cw, height: ch, bitsPerComponent: 8, bytesPerRow: cw * 4, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  let subImg = subCtx.makeImage()!
  let scale = min(1.0, Double(maxSide) / Double(max(cw, ch)))
  let ow = Int((Double(cw) * scale).rounded()), oh = Int((Double(ch) * scale).rounded())
  let outCtx = CGContext(data: nil, width: ow, height: oh, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  outCtx.interpolationQuality = .high
  outCtx.draw(subImg, in: CGRect(x: 0, y: 0, width: ow, height: oh))
  let url = outDir.appendingPathComponent("ton-\(names[k]).png")
  let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, outCtx.makeImage()!, nil)
  CGImageDestinationFinalize(dest)
  print(names[k], "кадр \(cw)x\(ch) →", "\(ow)x\(oh)", url.lastPathComponent)
}
_ = full
