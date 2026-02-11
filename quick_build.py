# MediaHub - Quick Build Script
# Builds frontend and packages the application

import subprocess
import sys
import os

def main():
    print("🎬 Building MediaHub Windows Application")
    print("=" * 60)
    
    # Step 1: Build Frontend
    print("\n📦 Step 1/2: Building frontend...")
    try:
        result = subprocess.run(
            ["npm", "run", "build"],
            cwd="frontend",
            shell=True,
            check=True,
            capture_output=True,
            text=True
        )
        print("✅ Frontend built successfully!")
    except subprocess.CalledProcessError as e:
        print(f"❌ Frontend build failed: {e}")
        print(e.stderr)
        return False
    
    # Step 2: Build Executable
    print("\n📦 Step 2/2: Building executable...")
    try:
        subprocess.run([sys.executable, "build.py"], check=True)
        print("\n" + "=" * 60)
        print("🎉 SUCCESS! MediaHub.exe is ready!")
        print("=" * 60)
        print(f"\n📂 Location: {os.path.abspath('dist/MediaHub.exe')}")
        print("\n💡 You can now:")
        print("   1. Run MediaHub.exe directly")
        print("   2. Move it anywhere on your system")
        print("   3. Create a desktop shortcut")
        print("   4. Share it with others (they don't need Python!)")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Executable build failed: {e}")
        return False

if __name__ == '__main__':
    main()
