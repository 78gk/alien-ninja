'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Zap, Camera as CameraIcon, RotateCcw, Skull, Trophy, Pause, Square } from 'lucide-react'

// Alien object types
type AlienObjectType = {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  rotationSpeed: number
  type: 'blaster' | 'drone' | 'turret' | 'missile' | 'bomb'
  size: number
  sliced: boolean
  points: number
  isBomb: boolean
  color: string
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

type TrailPoint = {
  x: number
  y: number
  life: number
}

export default function AlienNinja() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const animationRef = useRef<number>()
  const handLandmarksRef = useRef<any>(null)

  const [gameState, setGameState] = useState<'menu' | 'playing' | 'paused' | 'gameover'>('menu')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(5)
  const [cameraReady, setCameraReady] = useState(false)
  const [handDetected, setHandDetected] = useState(false)
  const [highScore, setHighScore] = useState(0)

  const objectsRef = useRef<AlienObjectType[]>([])
  const particlesRef = useRef<Particle[]>([])
  const trailRef = useRef<TrailPoint[]>([])

  // Game constants
  const GRAVITY = 0.15
  const TRAIL_LENGTH = 30
  const SMOOTHING_FACTOR = 0.7

  // Smooth finger tracking
  const smoothedPositionRef = useRef<{ x: number; y: number } | null>(null)

  // Initialize camera
  const initCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraReady(true)
        loadHandTracking()
      }
    } catch (error) {
      console.error('Error accessing camera:', error)
      alert('Failed to access camera. Please grant camera permissions.')
    }
  }

  // Load MediaPipe Hands from CDN
  const loadHandTracking = async () => {
    try {
      // Load MediaPipe Hands dynamically from CDN
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js'
      script.async = true
      await new Promise((resolve, reject) => {
        script.onload = resolve
        script.onerror = reject
        document.body.appendChild(script)
      })

      // Load camera utils
      const cameraScript = document.createElement('script')
      cameraScript.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'
      cameraScript.async = true
      await new Promise((resolve, reject) => {
        cameraScript.onload = resolve
        cameraScript.onerror = reject
        document.body.appendChild(cameraScript)
      })

      // @ts-ignore
      const hands = new Hands({
        locateFile: (file: string) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        }
      })

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
      })

      hands.onResults((results: any) => {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          const landmarks = results.multiHandLandmarks[0]
          handLandmarksRef.current = landmarks
          setHandDetected(true)

          // Get index finger tip position (landmark 8)
          const indexTip = landmarks[8]
          const canvas = canvasRef.current
          if (canvas) {
            let x = (1 - indexTip.x) * canvas.width // Mirror x
            let y = indexTip.y * canvas.height

            // Apply smoothing to reduce jitter
            if (smoothedPositionRef.current) {
              x = smoothedPositionRef.current.x * SMOOTHING_FACTOR + x * (1 - SMOOTHING_FACTOR)
              y = smoothedPositionRef.current.y * SMOOTHING_FACTOR + y * (1 - SMOOTHING_FACTOR)
            }
            smoothedPositionRef.current = { x, y }

            trailRef.current.push({ x, y, life: TRAIL_LENGTH })
            if (trailRef.current.length > TRAIL_LENGTH) {
              trailRef.current.shift()
            }
          }
        } else {
          setHandDetected(false)
          handLandmarksRef.current = null
        }
      })

      // @ts-ignore
      const mediaPipeCamera = new Camera(videoRef.current!, {
        onFrame: async () => {
          await hands.send({ image: videoRef.current! })
        },
        width: 640,
        height: 480
      })

      await mediaPipeCamera.start()
    } catch (error) {
      console.error('Error loading MediaPipe Hands:', error)
    }
  }

  // Spawn alien objects from random edges
  const spawnObject = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const types: Array<{ type: AlienObjectType['type']; points: number; isBomb: boolean; color: string; size: number }> = [
      { type: 'blaster', points: 10, isBomb: false, color: '#dc2626', size: 60 },
      { type: 'drone', points: 15, isBomb: false, color: '#1e40af', size: 70 },
      { type: 'turret', points: 20, isBomb: false, color: '#7c3aed', size: 80 },
      { type: 'missile', points: 25, isBomb: false, color: '#b45309', size: 65 },
      { type: 'blaster', points: 10, isBomb: false, color: '#dc2626', size: 60 },
      { type: 'drone', points: 15, isBomb: false, color: '#1e40af', size: 70 },
      { type: 'missile', points: 25, isBomb: false, color: '#b45309', size: 65 },
      { type: 'bomb', points: -1, isBomb: true, color: '#0a0a0a', size: 75 }
    ]

    const randomType = types[Math.floor(Math.random() * types.length)]
    const isBomb = randomType.isBomb

    // Random spawn from edges
    let startX: number, startY: number, velocityX: number, velocityY: number
    const side = Math.floor(Math.random() * 4) // 0: bottom, 1: top, 2: left, 3: right
    
    switch(side) {
      case 0: // Bottom
        startX = Math.random() * (canvas.width - 100) + 50
        startY = canvas.height + 60
        velocityX = (Math.random() - 0.5) * 3
        velocityY = -(Math.random() * 4 + 5)
        break
      case 1: // Top
        startX = Math.random() * (canvas.width - 100) + 50
        startY = -60
        velocityX = (Math.random() - 0.5) * 3
        velocityY = Math.random() * 4 + 5
        break
      case 2: // Left
        startX = -60
        startY = Math.random() * (canvas.height - 100) + 50
        velocityX = Math.random() * 4 + 5
        velocityY = (Math.random() - 0.5) * 3
        break
      case 3: // Right
        startX = canvas.width + 60
        startY = Math.random() * (canvas.height - 100) + 50
        velocityX = -(Math.random() * 4 + 5)
        velocityY = (Math.random() - 0.5) * 3
        break
    }

    const newObj: AlienObjectType = {
      id: Date.now() + Math.random(),
      x: startX,
      y: startY,
      vx: velocityX,
      vy: velocityY,
      rotation: 0,
      rotationSpeed: (Math.random() - 0.5) * 0.06,
      type: randomType.type,
      size: randomType.size,
      sliced: false,
      points: randomType.points,
      isBomb,
      color: randomType.color
    }

    objectsRef.current.push(newObj)
  }, [])

  // Create explosion particles
  const createExplosion = (x: number, y: number, color: string, count: number = 15) => {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5
      const speed = Math.random() * 5 + 3
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 1,
        color,
        size: Math.random() * 8 + 4
      })
    }
  }

  // Draw menacing alien objects
  const drawAlienObject = (ctx: CanvasRenderingContext2D, obj: AlienObjectType) => {
    ctx.save()
    ctx.translate(obj.x, obj.y)
    ctx.rotate(obj.rotation)

    const size = obj.size

    if (obj.type === 'blaster') {
      // Menacing blaster with teeth
      ctx.fillStyle = '#1a0a0a'
      ctx.beginPath()
      ctx.moveTo(-size/2, -size/4)
      ctx.lineTo(size/2, -size/4)
      ctx.lineTo(size/3, size/3)
      ctx.lineTo(-size/3, size/3)
      ctx.closePath()
      ctx.fill()
      
      // Angry eyes
      ctx.fillStyle = '#dc2626'
      ctx.beginPath()
      ctx.ellipse(-size/5, 0, size/8, size/6, -0.3, 0, Math.PI * 2)
      ctx.ellipse(size/5, 0, size/8, size/6, 0.3, 0, Math.PI * 2)
      ctx.fill()
      
      // Pupils
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.arc(-size/5, 0, size/16, 0, Math.PI * 2)
      ctx.arc(size/5, 0, size/16, 0, Math.PI * 2)
      ctx.fill()
      
      // Teeth
      ctx.fillStyle = '#fff'
      for(let i = 0; i < 5; i++) {
        const tx = -size/4 + i * size/8
        ctx.beginPath()
        ctx.moveTo(tx, size/4)
        ctx.lineTo(tx + size/20, size/2)
        ctx.lineTo(tx + size/10, size/4)
        ctx.fill()
      }
      
      // Glowing barrel
      ctx.shadowColor = '#dc2626'
      ctx.shadowBlur = 15
      ctx.fillStyle = '#ff0000'
      ctx.beginPath()
      ctx.arc(size/2, 0, size/5, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      
    } else if (obj.type === 'drone') {
      // Menacing drone with spikes
      ctx.fillStyle = '#0f172a'
      ctx.beginPath()
      ctx.arc(0, 0, size/2.5, 0, Math.PI * 2)
      ctx.fill()
      
      // Spikes
      ctx.fillStyle = '#1e40af'
      for(let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 * i) / 6
        ctx.beginPath()
        ctx.moveTo(Math.cos(angle) * size/3, Math.sin(angle) * size/3)
        ctx.lineTo(Math.cos(angle) * size/1.8, Math.sin(angle) * size/1.8)
        ctx.lineTo(Math.cos(angle + 0.5) * size/3, Math.sin(angle + 0.5) * size/3)
        ctx.fill()
      }
      
      // Glowing eye
      ctx.shadowColor = '#3b82f6'
      ctx.shadowBlur = 20
      ctx.fillStyle = '#60a5fa'
      ctx.beginPath()
      ctx.arc(0, 0, size/4, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      
      // Evil pupil
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.ellipse(0, 0, size/8, size/5, 0, 0, Math.PI * 2)
      ctx.fill()
      
    } else if (obj.type === 'turret') {
      // Menacing turret
      ctx.fillStyle = '#1e1b4b'
      ctx.beginPath()
      ctx.moveTo(-size/2, -size/3)
      ctx.lineTo(size/2, -size/3)
      ctx.lineTo(size/2.5, size/2.5)
      ctx.lineTo(-size/2.5, size/2.5)
      ctx.closePath()
      ctx.fill()
      
      // Multiple eyes
      ctx.fillStyle = '#7c3aed'
      ctx.shadowColor = '#7c3aed'
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.arc(-size/4, 0, size/8, 0, Math.PI * 2)
      ctx.arc(0, -size/6, size/10, 0, Math.PI * 2)
      ctx.arc(size/4, 0, size/8, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      
      // Pupils
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(-size/4, 0, size/16, 0, Math.PI * 2)
      ctx.arc(0, -size/6, size/18, 0, Math.PI * 2)
      ctx.arc(size/4, 0, size/16, 0, Math.PI * 2)
      ctx.fill()
      
      // Barrel
      ctx.fillStyle = '#4c1d95'
      ctx.fillRect(-size/8, size/4, size/4, size/2)
      ctx.shadowColor = '#7c3aed'
      ctx.shadowBlur = 15
      ctx.fillStyle = '#a78bfa'
      ctx.fillRect(-size/10, size/2, size/5, size/8)
      ctx.shadowBlur = 0
      
    } else if (obj.type === 'missile') {
      // Menacing missile
      ctx.fillStyle = '#451a03'
      ctx.beginPath()
      ctx.moveTo(0, -size/1.8)
      ctx.lineTo(-size/2, size/2.5)
      ctx.lineTo(size/2, size/2.5)
      ctx.closePath()
      ctx.fill()
      
      // Fins
      ctx.fillStyle = '#b45309'
      ctx.beginPath()
      ctx.moveTo(-size/2, size/2.5)
      ctx.lineTo(-size/1.5, size/2)
      ctx.lineTo(-size/2, size/3)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(size/2, size/2.5)
      ctx.lineTo(size/1.5, size/2)
      ctx.lineTo(size/2, size/3)
      ctx.fill()
      
      // Evil face
      ctx.fillStyle = '#fef3c7'
      ctx.beginPath()
      ctx.arc(0, -size/8, size/5, 0, Math.PI * 2)
      ctx.fill()
      
      // Evil eyes
      ctx.fillStyle = '#b45309'
      ctx.beginPath()
      ctx.moveTo(-size/8, -size/6)
      ctx.lineTo(-size/12, -size/10)
      ctx.lineTo(-size/4, -size/10)
      ctx.closePath()
      ctx.moveTo(size/8, -size/6)
      ctx.lineTo(size/12, -size/10)
      ctx.lineTo(size/4, -size/10)
      ctx.closePath()
      ctx.fill()
      
      // Glowing tip
      ctx.shadowColor = '#f59e0b'
      ctx.shadowBlur = 20
      ctx.fillStyle = '#fbbf24'
      ctx.beginPath()
      ctx.arc(0, -size/1.8, size/8, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      
    } else if (obj.type === 'bomb') {
      // Menacing bomb with skull-like face
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.arc(0, 0, size/2, 0, Math.PI * 2)
      ctx.fill()
      
      // Skull-like face
      ctx.fillStyle = '#1f2937'
      ctx.beginPath()
      ctx.ellipse(0, -size/8, size/4, size/6, 0, 0, Math.PI * 2)
      ctx.fill()
      
      // Eye sockets
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.ellipse(-size/8, -size/8, size/10, size/12, -0.2, 0, Math.PI * 2)
      ctx.ellipse(size/8, -size/8, size/10, size/12, 0.2, 0, Math.PI * 2)
      ctx.fill()
      
      // Glowing red eyes
      ctx.shadowColor = '#ef4444'
      ctx.shadowBlur = 15
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.arc(-size/8, -size/8, size/20, 0, Math.PI * 2)
      ctx.arc(size/8, -size/8, size/20, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      
      // Jagged mouth
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.moveTo(-size/4, size/8)
      ctx.lineTo(-size/6, size/4)
      ctx.lineTo(0, size/8)
      ctx.lineTo(size/6, size/4)
      ctx.lineTo(size/4, size/8)
      ctx.closePath()
      ctx.fill()
      
      // Pulsing fuse
      ctx.shadowColor = '#fbbf24'
      ctx.shadowBlur = 10
      ctx.fillStyle = '#fbbf24'
      ctx.fillRect(-size/12, -size/2 - 15, size/6, 15)
      ctx.beginPath()
      const pulseSize = 4 + Math.sin(Date.now() / 100) * 2
      ctx.arc(0, -size/2 - 15, pulseSize, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }

    ctx.restore()
  }

  // Check collision with finger trail
  const checkCollision = (obj: AlienObjectType) => {
    for (let i = 0; i < trailRef.current.length - 1; i++) {
      const point1 = trailRef.current[i]
      const point2 = trailRef.current[i + 1]

      const dx = point2.x - point1.x
      const dy = point2.y - point1.y
      const length = Math.sqrt(dx * dx + dy * dy)

      const steps = Math.max(1, Math.floor(length / 5))
      for (let step = 0; step <= steps; step++) {
        const t = step / steps
        const checkX = point1.x + dx * t
        const checkY = point1.y + dy * t

        const dist = Math.sqrt(
          Math.pow(checkX - obj.x, 2) + Math.pow(checkY - obj.y, 2)
        )

        // More forgiving collision detection (larger hit area)
        if (dist < obj.size / 1.6) {
          return true
        }
      }
    }
    return false
  }

  // Game loop
  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw grid background
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 1
    for (let i = 0; i < canvas.width; i += 50) {
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i, canvas.height)
      ctx.stroke()
    }
    for (let i = 0; i < canvas.height; i += 50) {
      ctx.beginPath()
      ctx.moveTo(0, i)
      ctx.lineTo(canvas.width, i)
      ctx.stroke()
    }

    if (gameState === 'playing' || gameState === 'paused') {
      // Update objects (only if playing)
      if (gameState === 'playing') {
        objectsRef.current.forEach((obj, index) => {
          obj.x += obj.vx
          obj.y += obj.vy
          obj.rotation += obj.rotationSpeed

          // Check if sliced
          if (!obj.sliced && handDetected && checkCollision(obj)) {
            obj.sliced = true
            if (obj.isBomb) {
              createExplosion(obj.x, obj.y, '#ef4444', 30)
              setLives(prev => Math.max(0, prev - 1))
              if (lives <= 1) {
                setGameState('gameover')
                setHighScore(prev => Math.max(prev, score))
              }
            } else {
              createExplosion(obj.x, obj.y, obj.color, 20)
              setScore(prev => prev + obj.points)
            }
          }

          // Remove objects that are far off screen or sliced
          if (
            obj.y > canvas.height + 150 || 
            obj.y < -150 || 
            obj.x > canvas.width + 150 || 
            obj.x < -150 || 
            obj.sliced
          ) {
            objectsRef.current.splice(index, 1)
          }
        })
      }

      // Update particles
      particlesRef.current.forEach((particle, index) => {
        particle.x += particle.vx
        particle.y += particle.vy
        particle.vy += 0.1
        particle.life -= 0.02

        if (particle.life <= 0) {
          particlesRef.current.splice(index, 1)
        }
      })

      // Update trail
      trailRef.current.forEach((point, index) => {
        point.life--
        if (point.life <= 0) {
          trailRef.current.splice(index, 1)
        }
      })
    }

    // Draw particles
    particlesRef.current.forEach(particle => {
      ctx.globalAlpha = particle.life / particle.maxLife
      ctx.fillStyle = particle.color
      ctx.beginPath()
      ctx.arc(particle.x, particle.y, particle.size * particle.life, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.globalAlpha = 1

    // Draw objects
    objectsRef.current.forEach(obj => {
      drawAlienObject(ctx, obj)
    })

    // Draw laser trail
    if (trailRef.current.length > 1) {
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      for (let i = 0; i < trailRef.current.length - 1; i++) {
        const point1 = trailRef.current[i]
        const point2 = trailRef.current[i + 1]
        const alpha = point1.life / TRAIL_LENGTH

        ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`
        ctx.lineWidth = 4 * alpha
        ctx.shadowColor = '#ef4444'
        ctx.shadowBlur = 20 * alpha

        ctx.beginPath()
        ctx.moveTo(point1.x, point1.y)
        ctx.lineTo(point2.x, point2.y)
        ctx.stroke()
      }

      ctx.shadowBlur = 0

      // Draw current finger position
      if (trailRef.current.length > 0) {
        const lastPoint = trailRef.current[trailRef.current.length - 1]
        ctx.fillStyle = '#ef4444'
        ctx.shadowColor = '#ef4444'
        ctx.shadowBlur = 30
        ctx.beginPath()
        ctx.arc(lastPoint.x, lastPoint.y, 10, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }
    }

    animationRef.current = requestAnimationFrame(gameLoop)
  }, [gameState, handDetected, lives, score])

  // Start game
  const startGame = useCallback(() => {
    objectsRef.current = []
    particlesRef.current = []
    trailRef.current = []
    setScore(0)
    setLives(5)
    setGameState('playing')
  }, [])

  // Pause game
  const pauseGame = useCallback(() => {
    setGameState('paused')
  }, [])

  // Resume game
  const resumeGame = useCallback(() => {
    setGameState('playing')
  }, [])

  // Stop game
  const stopGame = useCallback(() => {
    setHighScore(prev => Math.max(prev, score))
    setGameState('gameover')
  }, [score])

  useEffect(() => {
    let spawnInterval: NodeJS.Timeout | null = null

    if (gameState === 'playing') {
      spawnInterval = setInterval(() => {
        spawnObject()
      }, 1200)
    }

    return () => {
      if (spawnInterval) {
        clearInterval(spawnInterval)
      }
    }
  }, [gameState])

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = 800
      canvasRef.current.height = 600
    }
  }, [])

  useEffect(() => {
    gameLoop()
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [gameLoop])

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-red-500 p-2 rounded-lg">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Alien Ninja</h1>
                <p className="text-sm text-slate-400">Slice the alien weapons!</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              {(gameState === 'playing' || gameState === 'paused') && (
                <div className="flex items-center gap-2">
                  <Button
                    onClick={gameState === 'playing' ? pauseGame : resumeGame}
                    size="sm"
                    className="bg-yellow-600 hover:bg-yellow-700 text-white"
                  >
                    <Pause className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={stopGame}
                    size="sm"
                    className="bg-slate-700 hover:bg-slate-600 text-white"
                  >
                    <Square className="w-4 h-4" />
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <span className="text-xl font-bold text-white">{score}</span>
              </div>
              <div className="flex items-center gap-2">
                <Skull className="w-5 h-5 text-red-500" />
                <span className="text-xl font-bold text-white">{lives}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container mx-auto px-4 py-6 flex flex-col items-center gap-6">
        {/* Camera status */}
        {!cameraReady && (
          <Card className="w-full max-w-2xl p-6 border-slate-800 bg-slate-900/50">
            <div className="text-center space-y-4">
              <CameraIcon className="w-16 h-16 mx-auto text-slate-400" />
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">Camera Required</h3>
                <p className="text-slate-400 mb-4">
                  Enable your camera to control the laser blade with your finger movements.
                </p>
                <Button
                  onClick={initCamera}
                  size="lg"
                  className="bg-red-500 hover:bg-red-600 text-white"
                >
                  <CameraIcon className="w-5 h-5 mr-2" />
                  Enable Camera
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Canvas */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="rounded-xl border-4 border-slate-800 shadow-2xl"
            style={{ maxWidth: '100%', height: 'auto' }}
          />
          <video
            ref={videoRef}
            className="hidden"
            playsInline
          />

          {/* Hand detection indicator */}
          {cameraReady && (
            <div className="absolute top-4 right-4 flex items-center gap-2 bg-slate-950/80 backdrop-blur-sm px-3 py-2 rounded-lg">
              <div className={`w-3 h-3 rounded-full ${handDetected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-white font-medium">
                {handDetected ? 'Hand Detected' : 'No Hand Detected'}
              </span>
            </div>
          )}

          {/* Menu overlay */}
          {gameState === 'menu' && cameraReady && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <div className="text-center space-y-6 p-8">
                <div className="bg-red-500 p-4 rounded-full w-24 h-24 flex items-center justify-center mx-auto">
                  <Zap className="w-12 h-12 text-white" />
                </div>
                <div>
                  <h2 className="text-4xl font-bold text-white mb-2">Alien Ninja</h2>
                  <p className="text-slate-400 mb-6">
                    Use your finger to slice alien weapons before they escape!
                  </p>
                  <div className="text-left text-sm text-slate-300 space-y-2 mb-6 bg-slate-900/50 p-4 rounded-lg">
                    <p>🔴 Blaster: 10 points</p>
                    <p>🔵 Drone: 15 points</p>
                    <p>🟣 Turret: 20 points</p>
                    <p>🟠 Missile: 25 points</p>
                    <p>⚫ Bomb: DON'T SLICE!</p>
                  </div>
                  <Button
                    onClick={startGame}
                    size="lg"
                    className="bg-red-500 hover:bg-red-600 text-white text-lg px-8"
                  >
                    Start Game
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Pause overlay */}
          {gameState === 'paused' && (
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <div className="text-center space-y-6 p-8">
                <div className="bg-yellow-500 p-4 rounded-full w-24 h-24 flex items-center justify-center mx-auto">
                  <Pause className="w-12 h-12 text-white" />
                </div>
                <div>
                  <h2 className="text-4xl font-bold text-white mb-2">Game Paused</h2>
                  <p className="text-xl text-slate-300 mb-6">Score: {score}</p>
                  <div className="flex gap-4 justify-center">
                    <Button
                      onClick={resumeGame}
                      size="lg"
                      className="bg-green-600 hover:bg-green-700 text-white text-lg px-8"
                    >
                      <Pause className="w-5 h-5 mr-2" />
                      Resume
                    </Button>
                    <Button
                      onClick={stopGame}
                      size="lg"
                      className="bg-red-600 hover:bg-red-700 text-white text-lg px-8"
                    >
                      <Square className="w-5 h-5 mr-2" />
                      Stop Game
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Game over overlay */}
          {gameState === 'gameover' && (
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <div className="text-center space-y-6 p-8">
                <div className="bg-red-500 p-4 rounded-full w-24 h-24 flex items-center justify-center mx-auto">
                  <Skull className="w-12 h-12 text-white" />
                </div>
                <div>
                  <h2 className="text-4xl font-bold text-white mb-2">Game Over!</h2>
                  <p className="text-2xl text-slate-300 mb-2">Score: {score}</p>
                  <p className="text-lg text-slate-400 mb-6">High Score: {highScore}</p>
                  <Button
                    onClick={startGame}
                    size="lg"
                    className="bg-red-500 hover:bg-red-600 text-white text-lg px-8"
                  >
                    <RotateCcw className="w-5 h-5 mr-2" />
                    Play Again
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950/50 backdrop-blur-sm mt-auto">
        <div className="container mx-auto px-4 py-4">
          <p className="text-center text-slate-400 text-sm">
            👆 Raise your hand and move your index finger to control the laser blade
          </p>
        </div>
      </footer>
    </div>
  )
}
