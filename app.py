from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from PIL import Image, ImageFilter
import io
import os
import json
import numpy as np
from scipy import ndimage

app = Flask(__name__, static_folder='static')
CORS(app)

UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# Serve static files from the React app
@app.route('/')
def serve_react_app():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

def create_mask_with_region(img_array, target_color, tolerance, region=None):
    """Create a mask for the target color within specified region"""
    # Convert tolerance to a fraction
    tolerance = tolerance / 100.0
    
    # Calculate color differences
    diff = np.abs(img_array[:, :, :3] - np.array(target_color[:3]))
    
    # Create initial mask based on color
    color_mask = np.all(diff <= (255 * tolerance), axis=2)
    
    if region:
        # Create region mask
        x, y, width, height = region
        region_mask = np.zeros_like(color_mask, dtype=bool)
        region_mask[y:y+height, x:x+width] = True
        
        # Combine color mask with region mask
        color_mask = color_mask & region_mask
    
    # Apply morphological operations to clean up the mask
    color_mask = ndimage.binary_opening(color_mask, structure=np.ones((2,2)))
    color_mask = ndimage.binary_closing(color_mask, structure=np.ones((2,2)))
    
    # Smooth the mask
    color_mask = ndimage.gaussian_filter(color_mask.astype(float), sigma=0.5)
    
    return color_mask

def remove_background(image, color_selections):
    """Remove background with improved edge handling and region support"""
    # Convert image to RGBA if needed
    if image.mode != 'RGBA':
        image = image.convert('RGBA')
    
    # Convert to numpy array
    img_array = np.array(image)
    
    # Create combined mask
    combined_mask = np.zeros((img_array.shape[0], img_array.shape[1]))
    
    # Process each color selection
    for selection in color_selections:
        target_color = selection['color']
        tolerance = selection['tolerance']
        region = selection.get('region')  # Optional region parameter
        
        mask = create_mask_with_region(img_array, target_color, tolerance, region)
        combined_mask = np.maximum(combined_mask, mask)
    
    # Invert and scale the mask to 0-255
    alpha_mask = ((1 - combined_mask) * 255).astype(np.uint8)
    
    # Create output image array
    output_array = np.zeros_like(img_array)
    output_array[:, :, :3] = img_array[:, :, :3]
    output_array[:, :, 3] = alpha_mask
    
    # Convert back to PIL Image
    output_image = Image.fromarray(output_array)
    
    # Apply edge refinement
    output_image = output_image.filter(ImageFilter.UnsharpMask(radius=1, percent=150, threshold=3))
    
    return output_image

def apply_color_fill(image, fill_color):
    """Apply color fill to non-transparent parts of the image"""
    if not fill_color:  # If no fill color provided, return original image
        return image
        
    # Convert fill_color to RGB
    fill_rgb = tuple(fill_color[:3])
    
    # Convert image to numpy array
    img_array = np.array(image)
    
    # Create a mask of non-transparent pixels (alpha > 0)
    alpha_mask = img_array[:, :, 3] > 0
    
    # Create new image array with fill color
    new_img = np.zeros_like(img_array)
    new_img[alpha_mask] = [*fill_rgb, 255]  # Fill with new color and full opacity
    new_img[~alpha_mask] = [0, 0, 0, 0]     # Keep transparent pixels transparent
    
    return Image.fromarray(new_img)

@app.route('/remove-background', methods=['POST'])
def process_image():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    try:
        # Get the color selections from form data
        color_selections = json.loads(request.form.get('colorSelections', '[]'))
        fill_color = json.loads(request.form.get('fillColor', 'null'))
        
        # Read the image
        image_data = file.read()
        image = Image.open(io.BytesIO(image_data))
        
        # Process the image with the specified colors
        processed_image = remove_background(image, color_selections)
        
        # Apply color fill if specified
        if fill_color:
            processed_image = apply_color_fill(processed_image, fill_color)
        
        # Save to BytesIO object with maximum quality
        img_io = io.BytesIO()
        processed_image.save(img_io, 'PNG', quality=100, optimize=False)
        img_io.seek(0)
        
        return send_file(img_io, mimetype='image/png')
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
