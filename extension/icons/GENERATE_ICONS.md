# Icons Generation Script

This script generates placeholder PNG icons for the Chrome extension.

To generate proper icons from the SVG, use one of these methods:

## Option 1: Use an online converter
- Go to https://cloudconvert.com/svg-to-png
- Upload `icon.svg`
- Generate 16x16, 48x48, and 128x128 versions

## Option 2: Use ImageMagick (if installed)
```bash
convert extension/icons/icon.svg -resize 16x16 extension/icons/icon16.png
convert extension/icons/icon.svg -resize 48x48 extension/icons/icon48.png
convert extension/icons/icon.svg -resize 128x128 extension/icons/icon128.png
```

## Option 3: Use Inkscape
```bash
inkscape extension/icons/icon.svg -w 16 -h 16 -o extension/icons/icon16.png
inkscape extension/icons/icon.svg -w 48 -h 48 -o extension/icons/icon48.png
inkscape extension/icons/icon.svg -w 128 -h 128 -o extension/icons/icon128.png
```

## Option 4: Manual creation
Use any image editor (Photoshop, GIMP, Figma) to create:
- icon16.png (16x16 pixels)
- icon48.png (48x48 pixels)
- icon128.png (128x128 pixels)

The icons should use the cloud + sync theme with a blue (#0066cc) background.