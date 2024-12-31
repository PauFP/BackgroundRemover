import { useState, useRef, useEffect } from 'react'
import './App.css'

function App() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [processedImage, setProcessedImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [colorSelections, setColorSelections] = useState([
    { color: '#ffffff', tolerance: 30, region: null }
  ])
  const [fillColor, setFillColor] = useState(null)
  const [useFillColor, setUseFillColor] = useState(false)
  const [selectedColorIndex, setSelectedColorIndex] = useState(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPoint, setStartPoint] = useState(null)
  const [previewBackground, setPreviewBackground] = useState('#ffffff')
  const [isDragging, setIsDragging] = useState(false)
  const [cropMode, setCropMode] = useState(false)
  const [cropRegion, setCropRegion] = useState(null)
  
  const canvasRef = useRef(null)
  const imageRef = useRef(null)
  const fileInputRef = useRef(null)
  const cropCanvasRef = useRef(null)

  // Convert hex color to RGB array
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : [255, 255, 255]
  }

  const addColorSelection = () => {
    setColorSelections([...colorSelections, { color: '#ffffff', tolerance: 30, region: null }])
  }

  const removeColorSelection = (index) => {
    setColorSelections(colorSelections.filter((_, i) => i !== index))
    if (selectedColorIndex === index) {
      setSelectedColorIndex(null)
    }
  }

  const updateColorSelection = (index, field, value) => {
    const newSelections = [...colorSelections]
    newSelections[index] = { ...newSelections[index], [field]: value }
    setColorSelections(newSelections)
  }

  const handleDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files && files[0]) {
      handleFileSelect({ target: { files: [files[0]] } })
    }
  }

  const handleFileSelect = (event) => {
    const file = event.target.files[0]
    if (file) {
      setSelectedFile(file)
      setProcessedImage(null)
      
      // Load image for canvas
      const img = new Image()
      img.src = URL.createObjectURL(file)
      img.onload = () => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        
        // Set canvas size to match image
        canvas.width = img.width
        canvas.height = img.height
        
        // Draw image
        ctx.drawImage(img, 0, 0)
        imageRef.current = img
      }
    }
  }

  const handleCanvasMouseDown = (e) => {
    if (selectedColorIndex === null) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (canvas.width / rect.width)
    const y = (e.clientY - rect.top) * (canvas.height / rect.height)
    
    setIsDrawing(true)
    setStartPoint({ x, y })
  }

  const handleCanvasMouseMove = (e) => {
    if (!isDrawing || selectedColorIndex === null) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (canvas.width / rect.width)
    const y = (e.clientY - rect.top) * (canvas.height / rect.height)

    // Clear canvas and redraw image
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(imageRef.current, 0, 0)

    // Draw selection rectangle
    ctx.strokeStyle = 'red'
    ctx.lineWidth = 2
    ctx.setLineDash([5, 5])
    ctx.strokeRect(
      startPoint.x,
      startPoint.y,
      x - startPoint.x,
      y - startPoint.y
    )
  }

  const handleCanvasMouseUp = (e) => {
    if (!isDrawing || selectedColorIndex === null) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (canvas.width / rect.width)
    const y = (e.clientY - rect.top) * (canvas.height / rect.height)

    // Calculate region
    const region = [
      Math.min(startPoint.x, x),
      Math.min(startPoint.y, y),
      Math.abs(x - startPoint.x),
      Math.abs(y - startPoint.y)
    ].map(Math.round)

    // Update color selection with region
    const newSelections = [...colorSelections]
    newSelections[selectedColorIndex] = {
      ...newSelections[selectedColorIndex],
      region
    }
    setColorSelections(newSelections)

    // Reset drawing state
    setIsDrawing(false)
    setStartPoint(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!selectedFile) return

    setLoading(true)
    const formData = new FormData()
    formData.append('file', selectedFile)
    
    // Send color selections with regions
    formData.append('colorSelections', JSON.stringify(colorSelections.map(selection => ({
      color: hexToRgb(selection.color),
      tolerance: selection.tolerance,
      region: selection.region
    }))))
    
    // Add fill color if enabled
    if (useFillColor && fillColor) {
      formData.append('fillColor', JSON.stringify(hexToRgb(fillColor)))
    }

    try {
      const response = await fetch('/remove-background', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error('Failed to process image')

      const blob = await response.blob()
      setProcessedImage(URL.createObjectURL(blob))
    } catch (error) {
      console.error('Error:', error)
      alert('Failed to process image')
    } finally {
      setLoading(false)
    }
  }

  const initCropCanvas = () => {
    const img = new Image()
    img.src = processedImage
    img.onload = () => {
      const canvas = cropCanvasRef.current
      if (!canvas) return

      // Set canvas dimensions to match image
      canvas.width = img.width
      canvas.height = img.height

      // Draw initial image
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    }
  }

  useEffect(() => {
    if (cropMode && processedImage) {
      initCropCanvas()
    }
  }, [cropMode, processedImage])

  const handleCropMouseDown = (e) => {
    if (!cropMode) return
    const canvas = cropCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY
    setStartPoint({ x, y })
    setIsDrawing(true)
  }

  const handleCropMouseMove = (e) => {
    if (!cropMode || !isDrawing) return
    const canvas = cropCanvasRef.current
    const ctx = canvas.getContext('2d')
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const currentX = (e.clientX - rect.left) * scaleX
    const currentY = (e.clientY - rect.top) * scaleY

    // Clear previous drawing
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw the original image
    const img = new Image()
    img.src = processedImage
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    // Calculate crop region dimensions
    const x = Math.min(startPoint.x, currentX)
    const y = Math.min(startPoint.y, currentY)
    const width = Math.abs(currentX - startPoint.x)
    const height = Math.abs(currentY - startPoint.y)

    // Draw semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Create clipping path for the crop region
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, width, height)
    ctx.clip()
    
    // Draw the original image only in the crop region
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    ctx.restore()

    // Draw border around crop region
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.strokeRect(x, y, width, height)

    setCropRegion({ x, y, width, height })
  }

  const handleCropMouseUp = () => {
    setIsDrawing(false)
  }

  const handleCrop = () => {
    if (!cropRegion) return

    const canvas = cropCanvasRef.current
    
    // Create a new canvas for the cropped image
    const croppedCanvas = document.createElement('canvas')
    croppedCanvas.width = cropRegion.width
    croppedCanvas.height = cropRegion.height
    const croppedCtx = croppedCanvas.getContext('2d')

    // Draw the cropped region
    const img = new Image()
    img.src = processedImage
    img.onload = () => {
      croppedCtx.drawImage(
        img,
        cropRegion.x,
        cropRegion.y,
        cropRegion.width,
        cropRegion.height,
        0,
        0,
        cropRegion.width,
        cropRegion.height
      )

      // Update the processed image with the cropped version
      setProcessedImage(croppedCanvas.toDataURL('image/png'))
      setCropMode(false)
      setCropRegion(null)
    }
  }

  return (
    <div className="app-container">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        accept="image/*"
      />
      <div className="sidebar">
        {selectedFile && (
          <button 
            onClick={() => fileInputRef.current.click()} 
            className="download-button secondary"
            style={{ marginBottom: '1rem', width: '100%' }}
          >
            Change Image
          </button>
        )}
        <h3>Color Controls</h3>
        <div className="color-selections">
          {colorSelections.map((selection, index) => (
            <div
              key={index}
              className={`color-item ${selectedColorIndex === index ? 'selected' : ''}`}
              onClick={() => setSelectedColorIndex(index)}
            >
              <input
                type="color"
                value={selection.color}
                onChange={(e) => updateColorSelection(index, 'color', e.target.value)}
              />
              <div className="tolerance-slider">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={selection.tolerance}
                  onChange={(e) => updateColorSelection(index, 'tolerance', parseInt(e.target.value))}
                />
                <span>{selection.tolerance}</span>
              </div>
              <button
                className="remove-button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeColorSelection(index)
                }}
              >
                ×
              </button>
            </div>
          ))}
          <button onClick={addColorSelection} className="add-color-button">
            Add Color
          </button>
        </div>

        <div className="fill-color-control">
          <label>
            <input
              type="checkbox"
              checked={useFillColor}
              onChange={(e) => setUseFillColor(e.target.checked)}
            />
            Fill Color
          </label>
          {useFillColor && (
            <input
              type="color"
              value={fillColor || '#000000'}
              onChange={(e) => setFillColor(e.target.value)}
            />
          )}
        </div>
      </div>

      <div className="main-content">
        <h1 className="app-title">Background Remover</h1>
        
        {!selectedFile ? (
          <div 
            className={`drop-zone ${isDragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current.click()}
          >
            <div className="drop-zone-content">
              <div className="upload-icon">↑</div>
              <p>Drag and drop your image here or click to browse</p>
            </div>
          </div>
        ) : (
          <div className="canvas-container">
            <canvas 
              ref={canvasRef} 
              className="preview-canvas" 
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={() => setIsDrawing(false)}
            />
          </div>
        )}

        {selectedFile && (
          <div className="button-container">
            <button 
              onClick={handleSubmit}
              disabled={loading}
              className="download-button"
            >
              {loading ? 'Processing...' : 'Remove Background'}
            </button>
          </div>
        )}

        {processedImage && (
          <div className="result-container">
            <h3>Result</h3>
            <div className="preview-background-control">
              <label>
                Preview Background:
                <input
                  type="color"
                  value={previewBackground}
                  onChange={(e) => setPreviewBackground(e.target.value)}
                />
              </label>
            </div>
            <div 
              className="preview-wrapper"
              style={{ backgroundColor: previewBackground }}
            >
              {cropMode ? (
                <canvas
                  ref={cropCanvasRef}
                  className="preview-image"
                  onMouseDown={handleCropMouseDown}
                  onMouseMove={handleCropMouseMove}
                  onMouseUp={handleCropMouseUp}
                  onMouseLeave={handleCropMouseUp}
                />
              ) : (
                <img
                  src={processedImage}
                  alt="Processed"
                  className="preview-image"
                />
              )}
            </div>
            <div className="result-actions">
              {cropMode ? (
                <>
                  <button onClick={handleCrop} className="download-button">
                    Apply Crop
                  </button>
                  <button onClick={() => setCropMode(false)} className="download-button secondary">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setCropMode(true)} className="download-button">
                    Crop Image
                  </button>
                  <a
                    href={processedImage}
                    download="processed-logo.png"
                    className="download-button"
                  >
                    Download Image
                  </a>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
