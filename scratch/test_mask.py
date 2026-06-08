from PIL import Image, ImageDraw

def mask_image():
    source_path = r"C:\Users\seguc\.gemini\antigravity\brain\eb5bfbb0-1273-43db-a1b2-075e4866bbf9\media__1779262381743.jpg"
    img = Image.open(source_path)
    width, height = img.size
    print(f"Image dimensions: {width}x{height}")

if __name__ == "__main__":
    mask_image()
