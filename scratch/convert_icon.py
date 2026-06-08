import os
from PIL import Image

def generate_icons():
    source_path = r"c:\Users\seguc\Downloads\PROYECTO POS\scratch\transparent_icon.png"
    public_dir = r"c:\Users\seguc\Downloads\PROYECTO POS\public"
    build_dir = r"c:\Users\seguc\Downloads\PROYECTO POS\build"

    # Ensure directories exist
    os.makedirs(public_dir, exist_ok=True)
    os.makedirs(build_dir, exist_ok=True)

    if not os.path.exists(source_path):
        print(f"Error: Transparent source image not found at {source_path}")
        return

    # Open image
    img = Image.open(source_path).convert("RGBA")

    # Convert/Save as public/icon.png
    img.save(os.path.join(public_dir, "icon.png"), format="PNG")
    print("Saved public/icon.png")

    # Generate additional web sizes with transparency
    light_32 = img.resize((32, 32), Image.Resampling.LANCZOS)
    light_32.save(os.path.join(public_dir, "icon-light-32x32.png"), format="PNG")
    light_32.save(os.path.join(public_dir, "icon-dark-32x32.png"), format="PNG")
    print("Saved public/icon-light-32x32.png and public/icon-dark-32x32.png")

    apple_icon = img.resize((180, 180), Image.Resampling.LANCZOS)
    apple_icon.save(os.path.join(public_dir, "apple-icon.png"), format="PNG")
    print("Saved public/apple-icon.png")

    # Generate multi-resolution ICO for both public/icon.ico and build/icon.ico
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    
    ico_public_path = os.path.join(public_dir, "icon.ico")
    ico_build_path = os.path.join(build_dir, "icon.ico")

    # PIL supports writing transparency to ICO if image is RGBA
    img.save(ico_public_path, format="ICO", sizes=sizes)
    print(f"Saved {ico_public_path}")

    img.save(ico_build_path, format="ICO", sizes=sizes)
    print(f"Saved {ico_build_path}")

if __name__ == "__main__":
    generate_icons()
