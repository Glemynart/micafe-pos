from PIL import Image

def analyze():
    source_path = r"C:\Users\seguc\.gemini\antigravity\brain\eb5bfbb0-1273-43db-a1b2-075e4866bbf9\media__1779262381743.jpg"
    img = Image.open(source_path).convert("RGB")
    width, height = img.size

    # Find the bounding box of the non-white pixels
    # We define a pixel as "non-white" if its R, G, or B is less than 240
    left = width
    right = 0
    top = height
    bottom = 0

    for y in range(height):
        for x in range(width):
            r, g, b = img.getpixel((x, y))
            # If it's not white
            if r < 240 or g < 240 or b < 240:
                if x < left: left = x
                if x > right: right = x
                if y < top: top = y
                if y > bottom: bottom = y

    print(f"Bounding Box of Teal: left={left}, right={right}, top={top}, bottom={bottom}")
    print(f"Width={right - left + 1}, Height={bottom - top + 1}")

if __name__ == "__main__":
    analyze()
