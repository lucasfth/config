---
name: findmy-device-locator
description: Locate Apple devices and AirTag items via FindMy.app screenshot + OCR
trigger: user wants to find where their devices are
---

# FindMy Device Locator

## Steps
1. Open FindMy.app: `open /System/Applications/FindMy.app`
2. Wait for map to load: `sleep 2`
3. Capture screenshot: `screencapture -x ~/Desktop/findmy.png`
4. Run OCR to extract text:
   ```bash
   python3 -c "
   from PIL import Image
   import pytesseract
   img = Image.open('~/Desktop/findmy.png')
   text = pytesseract.image_to_string(img)
   print(text)
   "
   ```
5. Parse OCR output to identify device names, locations, and timestamps

## Notes
- Requires macOS screen recording permission
- OCR works best when FindMy map is fully zoomed out showing all items
- Items show: device/item name, location address, last seen time
- Clean up screenshot after: `rm ~/Desktop/findmy.png`