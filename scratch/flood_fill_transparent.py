import os
from PIL import Image, ImageFilter

def flood_fill_transparent():
    source_path = r"C:\Users\seguc\.gemini\antigravity\brain\eb5bfbb0-1273-43db-a1b2-075e4866bbf9\media__1779262381743.jpg"
    img = Image.open(source_path).convert("RGBA")
    width, height = img.size
    
    # Create a mask of the same size, initialized to 255 (opaque foreground)
    mask = Image.new("L", (width, height), 255)
    
    pixels = img.convert("RGB")
    visited = set()
    queue = []
    
    # Helper to check if pixel is "white-ish"
    def is_whiteish(x, y):
        r, g, b = pixels.getpixel((x, y))
        return r > 230 and g > 230 and b > 230

    # Add all border pixels that are white-ish to the queue
    for x in range(width):
        if is_whiteish(x, 0):
            queue.append((x, 0))
            visited.add((x, 0))
        if is_whiteish(x, height - 1):
            queue.append((x, height - 1))
            visited.add((x, height - 1))
            
    for y in range(1, height - 1):
        if is_whiteish(0, y):
            queue.append((0, y))
            visited.add((0, y))
        if is_whiteish(width - 1, y):
            queue.append((width - 1, y))
            visited.add((width - 1, y))

    # BFS to find all connected white background pixels
    while queue:
        cx, cy = queue.pop(0)
        
        # Mark in mask as background (0)
        mask.putpixel((cx, cy), 0)
        
        # Check 4-neighbors
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < width and 0 <= ny < height:
                if (nx, ny) not in visited:
                    if is_whiteish(nx, ny):
                        visited.add((nx, ny))
                        queue.append((nx, ny))

    # To smooth the edges, we can apply a tiny Gaussian blur to the binary mask.
    # A blur radius of 1 or 1.5 is perfect for anti-aliasing.
    smoothed_mask = mask.filter(ImageFilter.GaussianBlur(1.2))

    # Apply the smoothed mask to the image's alpha channel
    img.putalpha(smoothed_mask)
    
    # Save the polished transparent icon
    test_path = r"c:\Users\seguc\Downloads\PROYECTO POS\scratch\transparent_icon.png"
    img.save(test_path, "PNG")
    print(f"Saved smoothed transparent icon to {test_path}")

if __name__ == "__main__":
    flood_fill_transparent()
