import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, Image as KonvaImage, Layer, Line, Stage, Text } from 'react-konva'

function App() {
  const fileInputRef = useRef(null)
  const jsonInputRef = useRef(null)
  const containerRef = useRef(null)

  const [fileName, setFileName] = useState('')
  const [htmlImage, setHtmlImage] = useState(null)
  const [planImageDataUrl, setPlanImageDataUrl] = useState('')

  const [stageSize, setStageSize] = useState({ width: 900, height: 600 })

  const [isScaleMode, setIsScaleMode] = useState(false)
  const [scalePoints, setScalePoints] = useState([])
  const [realDistanceInput, setRealDistanceInput] = useState('')
  const [mmPerPx, setMmPerPx] = useState(null)

  const [isDrawMode, setIsDrawMode] = useState(false)
  const [drawingStartPoint, setDrawingStartPoint] = useState(null)
  const [segments, setSegments] = useState([])
  const [selectedSegmentId, setSelectedSegmentId] = useState(null)

  const [maxPostSpacingMm, setMaxPostSpacingMm] = useState('2000')
  const [posts, setPosts] = useState([])
  const [selectedPostId, setSelectedPostId] = useState(null)

  const [isAddPostMode, setIsAddPostMode] = useState(false)
  const [showRails, setShowRails] = useState(true)

  const [postUnitPrice, setPostUnitPrice] = useState('55000')
  const [railUnitPricePerM, setRailUnitPricePerM] = useState('12000')
  const [clampUnitPrice, setClampUnitPrice] = useState('2500')
  const [boltUnitPrice, setBoltUnitPrice] = useState('350')

  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      setStageSize({
        width: Math.max(400, Math.floor(rect.width)),
        height: Math.max(400, Math.floor(rect.height)),
      })
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const imageLayout = useMemo(() => {
    if (!htmlImage) return null

    const padding = 20
    const maxWidth = stageSize.width - padding * 2
    const maxHeight = stageSize.height - padding * 2

    const scale = Math.min(
      maxWidth / htmlImage.width,
      maxHeight / htmlImage.height,
      1
    )

    const width = htmlImage.width * scale
    const height = htmlImage.height * scale
    const x = (stageSize.width - width) / 2
    const y = (stageSize.height - height) / 2

    return { x, y, width, height, scale }
  }, [htmlImage, stageSize])

  const pixelDistance = useMemo(() => {
    if (scalePoints.length !== 2) return 0
    const [a, b] = scalePoints
    return Math.hypot(b.x - a.x, b.y - a.y)
  }, [scalePoints])

  const totalLengthPx = useMemo(() => {
    return segments.reduce((sum, seg) => sum + getDistance(seg.start, seg.end), 0)
  }, [segments])

  const totalLengthMm = useMemo(() => {
    if (!mmPerPx) return 0
    return totalLengthPx * mmPerPx
  }, [totalLengthPx, mmPerPx])

  const segmentSummaries = useMemo(() => {
    return segments.map((seg) => {
      const px = getDistance(seg.start, seg.end)
      const mm = mmPerPx ? px * mmPerPx : null

      const relatedPostIds = new Set()
      posts.forEach((post) => {
        if (post.segmentIds.includes(seg.id)) relatedPostIds.add(post.id)
      })

      return {
        id: seg.id,
        pxLength: px,
        mmLength: mm,
        postCount: relatedPostIds.size,
      }
    })
  }, [segments, posts, mmPerPx])

  const lineMid = useMemo(() => {
    if (scalePoints.length !== 2) return null
    const [a, b] = scalePoints
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    }
  }, [scalePoints])

  const selectedPost = useMemo(
    () => posts.find((post) => post.id === selectedPostId) || null,
    [posts, selectedPostId]
  )

  const segmentRailLines = useMemo(() => {
    if (!showRails) return []

    const railOffsets = [-10, 0, 10]
    const railLines = []

    segments.forEach((segment) => {
      const relatedPosts = posts
        .filter((post) => post.segmentIds.includes(segment.id))
        .map((post) => ({
          ...post,
          sortT: projectionRatioOnSegment(post, segment),
        }))
        .sort((a, b) => a.sortT - b.sortT)

      if (relatedPosts.length < 2) return

      for (let i = 0; i < relatedPosts.length - 1; i += 1) {
        const postA = relatedPosts[i]
        const postB = relatedPosts[i + 1]

        railOffsets.forEach((offset, railIndex) => {
          const shifted = getOffsetSegment(
            { x: postA.x, y: postA.y },
            { x: postB.x, y: postB.y },
            offset
          )

          railLines.push({
            id: `${segment.id}-${postA.id}-${postB.id}-${railIndex}`,
            segmentId: segment.id,
            railIndex,
            start: shifted.start,
            end: shifted.end,
          })
        })
      }
    })

    return railLines
  }, [segments, posts, showRails])

  const estimate = useMemo(() => {
    const autoPostCount = posts.filter((post) => !post.isManual).length
    const manualPostCount = posts.filter((post) => post.isManual).length
    const totalPostCount = posts.length

    const railTotalPx = segmentRailLines.reduce(
      (sum, rail) => sum + getDistance(rail.start, rail.end),
      0
    )

    const railTotalMm = mmPerPx ? railTotalPx * mmPerPx : 0
    const railTotalM = railTotalMm / 1000

    const clampCount = totalPostCount * 3
    const boltCount = clampCount * 2

    const postPrice = toNumber(postUnitPrice)
    const railPrice = toNumber(railUnitPricePerM)
    const clampPrice = toNumber(clampUnitPrice)
    const boltPrice = toNumber(boltUnitPrice)

    const postAmount = totalPostCount * postPrice
    const railAmount = railTotalM * railPrice
    const clampAmount = clampCount * clampPrice
    const boltAmount = boltCount * boltPrice

    const totalAmount = postAmount + railAmount + clampAmount + boltAmount

    return {
      autoPostCount,
      manualPostCount,
      totalPostCount,
      railTotalPx,
      railTotalMm,
      railTotalM,
      clampCount,
      boltCount,
      postAmount,
      railAmount,
      clampAmount,
      boltAmount,
      totalAmount,
    }
  }, [
    posts,
    segmentRailLines,
    mmPerPx,
    postUnitPrice,
    railUnitPricePerM,
    clampUnitPrice,
    boltUnitPrice,
  ])

  const resetAllWorkState = () => {
    setScalePoints([])
    setRealDistanceInput('')
    setMmPerPx(null)
    setIsScaleMode(false)

    setIsDrawMode(false)
    setDrawingStartPoint(null)
    setSegments([])
    setSelectedSegmentId(null)

    setPosts([])
    setSelectedPostId(null)

    setIsAddPostMode(false)
  }

  const loadImageFromDataUrl = (dataUrl) => {
    return new Promise((resolve, reject) => {
      if (!dataUrl) {
        resolve(null)
        return
      }

      const img = new window.Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = dataUrl
    })
  }

  const handleClickUpload = () => {
    fileInputRef.current?.click()
  }

  const handleClickImportJson = () => {
    jsonInputRef.current?.click()
  }

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다. PNG 또는 JPG 파일을 선택해주세요.')
      return
    }

    const reader = new FileReader()

    reader.onload = async () => {
      const result = reader.result
      setFileName(file.name)
      setPlanImageDataUrl(result)

      try {
        const img = await loadImageFromDataUrl(result)
        setHtmlImage(img)
      } catch {
        alert('이미지 로딩 중 오류가 발생했습니다.')
      }

      resetAllWorkState()
    }

    reader.readAsDataURL(file)
  }

  const handleImportJsonChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()

    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result)

        if (!parsed || parsed.type !== 'goraeeum-safety-guardrail-project') {
          alert('올바른 프로젝트 JSON 파일이 아닙니다.')
          return
        }

        const nextImageDataUrl = parsed.planImageDataUrl || ''
        let nextHtmlImage = null

        if (nextImageDataUrl) {
          nextHtmlImage = await loadImageFromDataUrl(nextImageDataUrl)
        }

        setFileName(parsed.fileName || '')
        setPlanImageDataUrl(nextImageDataUrl)
        setHtmlImage(nextHtmlImage)

        setScalePoints(parsed.scalePoints || [])
        setRealDistanceInput(parsed.realDistanceInput || '')
        setMmPerPx(parsed.mmPerPx ?? null)
        setIsScaleMode(false)

        setIsDrawMode(false)
        setDrawingStartPoint(null)
        setSegments(parsed.segments || [])
        setSelectedSegmentId(null)

        setPosts(parsed.posts || [])
        setSelectedPostId(null)

        setIsAddPostMode(false)
        setShowRails(parsed.showRails ?? true)

        setMaxPostSpacingMm(parsed.maxPostSpacingMm || '2000')

        setPostUnitPrice(parsed.postUnitPrice || '55000')
        setRailUnitPricePerM(parsed.railUnitPricePerM || '12000')
        setClampUnitPrice(parsed.clampUnitPrice || '2500')
        setBoltUnitPrice(parsed.boltUnitPrice || '350')
      } catch (error) {
        console.error(error)
        alert('JSON 불러오기에 실패했습니다. 파일 내용을 확인해주세요.')
      } finally {
        if (jsonInputRef.current) {
          jsonInputRef.current.value = ''
        }
      }
    }

    reader.readAsText(file, 'utf-8')
  }

  const handleExportProject = () => {
    const projectData = {
      type: 'goraeeum-safety-guardrail-project',
      version: 1,
      exportedAt: new Date().toISOString(),
      fileName,
      planImageDataUrl,
      scalePoints,
      realDistanceInput,
      mmPerPx,
      segments,
      posts,
      showRails,
      maxPostSpacingMm,
      postUnitPrice,
      railUnitPricePerM,
      clampUnitPrice,
      boltUnitPrice,
    }

    const blob = new Blob([JSON.stringify(projectData, null, 2)], {
      type: 'application/json',
    })

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const safeName = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'project'
    a.href = url
    a.download = `${safeName}-guardrail-project.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClearImage = () => {
    setFileName('')
    setPlanImageDataUrl('')
    setHtmlImage(null)
    resetAllWorkState()

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleStartScaleMode = () => {
    if (!htmlImage) {
      alert('먼저 도면 이미지를 업로드해주세요.')
      return
    }

    setIsDrawMode(false)
    setIsAddPostMode(false)
    setDrawingStartPoint(null)
    setSelectedSegmentId(null)
    setSelectedPostId(null)

    setScalePoints([])
    setMmPerPx(null)
    setPosts([])

    setIsScaleMode(true)
  }

  const handleResetScale = () => {
    setScalePoints([])
    setRealDistanceInput('')
    setMmPerPx(null)
    setIsScaleMode(false)
    setPosts([])
    setSelectedPostId(null)
  }

  const handleApplyScale = () => {
    const realMm = Number(realDistanceInput)

    if (scalePoints.length !== 2) {
      alert('도면 위에서 축척 기준점 2개를 먼저 찍어주세요.')
      return
    }

    if (!realMm || realMm <= 0) {
      alert('실제 거리(mm)를 올바르게 입력해주세요.')
      return
    }

    if (!pixelDistance || pixelDistance <= 0) {
      alert('픽셀 거리를 계산할 수 없습니다.')
      return
    }

    setMmPerPx(realMm / pixelDistance)
    setPosts([])
    setSelectedPostId(null)
  }

  const handleStartDrawMode = () => {
    if (!htmlImage) {
      alert('먼저 도면 이미지를 업로드해주세요.')
      return
    }

    setIsScaleMode(false)
    setIsAddPostMode(false)
    setDrawingStartPoint(null)
    setSelectedSegmentId(null)
    setSelectedPostId(null)
    setIsDrawMode(true)
  }

  const handleStopDrawMode = () => {
    setIsDrawMode(false)
    setDrawingStartPoint(null)
  }

  const handleStartAddPostMode = () => {
    if (!htmlImage) {
      alert('먼저 도면 이미지를 업로드해주세요.')
      return
    }

    setIsScaleMode(false)
    setIsDrawMode(false)
    setDrawingStartPoint(null)
    setSelectedSegmentId(null)
    setSelectedPostId(null)
    setIsAddPostMode(true)
  }

  const handleStopAddPostMode = () => {
    setIsAddPostMode(false)
  }

  const handleDeleteSelectedSegment = () => {
    if (!selectedSegmentId) {
      alert('삭제할 선을 먼저 선택해주세요.')
      return
    }

    setSegments((prev) => prev.filter((seg) => seg.id !== selectedSegmentId))
    setPosts((prev) =>
      prev
        .map((post) => ({
          ...post,
          segmentIds: post.segmentIds.filter((id) => id !== selectedSegmentId),
        }))
        .filter((post) => post.segmentIds.length > 0 || post.isManual)
    )
    setSelectedSegmentId(null)
  }

  const handleClearSegments = () => {
    setSegments([])
    setDrawingStartPoint(null)
    setSelectedSegmentId(null)
    setIsDrawMode(false)
    setPosts([])
    setSelectedPostId(null)
  }

  const handleDeleteSelectedPost = () => {
    if (!selectedPostId) {
      alert('삭제할 포스트를 먼저 선택해주세요.')
      return
    }

    setPosts((prev) => prev.filter((post) => post.id !== selectedPostId))
    setSelectedPostId(null)
  }

  const handleStageClick = (event) => {
    if (!imageLayout) return

    const stage = event.target.getStage()
    const pointer = stage?.getPointerPosition()
    if (!pointer) return

    const withinImage =
      pointer.x >= imageLayout.x &&
      pointer.x <= imageLayout.x + imageLayout.width &&
      pointer.y >= imageLayout.y &&
      pointer.y <= imageLayout.y + imageLayout.height

    if (!withinImage) return

    if (isScaleMode) {
      if (scalePoints.length >= 2) return

      const nextPoints = [...scalePoints, { x: pointer.x, y: pointer.y }]
      setScalePoints(nextPoints)

      if (nextPoints.length === 2) {
        setIsScaleMode(false)
      }
      return
    }

    if (isDrawMode) {
      setSelectedSegmentId(null)
      setSelectedPostId(null)

      if (!drawingStartPoint) {
        setDrawingStartPoint({ x: pointer.x, y: pointer.y })
      } else {
        const newSegment = {
          id: createId(),
          start: drawingStartPoint,
          end: { x: pointer.x, y: pointer.y },
        }

        setSegments((prev) => [...prev, newSegment])
        setDrawingStartPoint(null)
        setPosts([])
      }
      return
    }

    if (isAddPostMode) {
      const relatedSegmentIds = segments
        .filter((segment) => distancePointToSegment(pointer, segment.start, segment.end) <= 14)
        .map((segment) => segment.id)

      const newPost = {
        id: createId(),
        x: pointer.x,
        y: pointer.y,
        segmentIds: relatedSegmentIds,
        sourceItems: [],
        isManual: true,
      }

      setPosts((prev) => [...prev, newPost])
      setSelectedPostId(newPost.id)
      setSelectedSegmentId(null)
      return
    }

    setSelectedSegmentId(null)
    setSelectedPostId(null)
  }

  const handleGeneratePosts = () => {
    if (!mmPerPx) {
      alert('먼저 축척을 설정해주세요.')
      return
    }

    if (segments.length === 0) {
      alert('먼저 설치 구간 선을 그려주세요.')
      return
    }

    const spacingMm = Number(maxPostSpacingMm)

    if (!spacingMm || spacingMm <= 0) {
      alert('최대 포스트 간격(mm)을 올바르게 입력해주세요.')
      return
    }

    const manualPosts = posts.filter((post) => post.isManual)

    const rawPosts = []

    segments.forEach((segment) => {
      const pxLength = getDistance(segment.start, segment.end)
      const mmLength = pxLength * mmPerPx

      const spanCount = Math.max(1, Math.ceil(mmLength / spacingMm))
      const postCount = spanCount + 1

      for (let i = 0; i < postCount; i += 1) {
        const t = postCount === 1 ? 0 : i / (postCount - 1)
        const point = interpolatePoint(segment.start, segment.end, t)

        rawPosts.push({
          id: createId(),
          x: point.x,
          y: point.y,
          segmentIds: [segment.id],
          sourceItems: [
            {
              segmentId: segment.id,
              indexInSegment: i + 1,
              postCountInSegment: postCount,
            },
          ],
          isManual: false,
        })
      }
    })

    const mergedAutoPosts = mergeNearbyPosts(rawPosts, 10)
    setPosts([...mergedAutoPosts, ...manualPosts])
    setSelectedPostId(null)
  }

  const handleClearPosts = () => {
    setPosts([])
    setSelectedPostId(null)
  }

  const handlePostDragEnd = (postId, x, y) => {
    setPosts((prev) =>
      prev.map((post) => (post.id === postId ? { ...post, x, y } : post))
    )
  }

  return (
    <div style={styles.app}>
      <aside style={styles.left}>
        <h2 style={styles.panelTitle}>설정 패널</h2>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>도면 업로드 / 프로젝트</h3>

          <button style={styles.primaryButton} onClick={handleClickUpload}>
            도면 이미지 업로드
          </button>

          <button style={styles.secondaryButton} onClick={handleExportProject}>
            프로젝트 저장(JSON)
          </button>

          <button style={styles.secondaryButton} onClick={handleClickImportJson}>
            프로젝트 불러오기(JSON)
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          <input
            ref={jsonInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleImportJsonChange}
          />

          <p style={styles.helpText}>
            PNG, JPG 형식의 도면 이미지를 업로드하거나, 저장한 JSON 프로젝트를 다시 불러올 수 있습니다.
          </p>

          {fileName && (
            <div style={styles.fileBox}>
              <div style={styles.fileName}>{fileName}</div>
              <button style={styles.secondaryButton} onClick={handleClearImage}>
                도면 지우기
              </button>
            </div>
          )}
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>축척 설정</h3>

          <button style={styles.primaryButton} onClick={handleStartScaleMode}>
            축척 기준점 찍기 시작
          </button>

          <button style={styles.secondaryButton} onClick={handleResetScale}>
            축척 초기화
          </button>

          <p style={styles.helpText}>
            1. 버튼 클릭 후 도면 위 기준점 2개를 찍으세요.
          </p>
          <p style={styles.helpText}>
            2. 두 점 사이 실제 거리(mm)를 입력하세요.
          </p>

          <div style={{ marginTop: 12 }}>
            <label style={styles.inputLabel}>실제 거리 (mm)</label>
            <input
              type="number"
              value={realDistanceInput}
              onChange={(e) => setRealDistanceInput(e.target.value)}
              placeholder="예: 1000"
              style={styles.input}
            />
          </div>

          <button style={styles.primaryButton} onClick={handleApplyScale}>
            축척 적용
          </button>

          <div style={styles.infoBox}>
            <div style={styles.infoLine}>선택 점 개수: {scalePoints.length} / 2</div>
            <div style={styles.infoLine}>
              픽셀 거리: {pixelDistance ? pixelDistance.toFixed(2) : '-'} px
            </div>
            <div style={styles.infoLine}>
              상태: {isScaleMode ? '축척 기준점 선택 중' : '대기'}
            </div>
          </div>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>설치 구간 선 그리기</h3>

          <button style={styles.primaryButton} onClick={handleStartDrawMode}>
            선 그리기 시작
          </button>

          <button style={styles.secondaryButton} onClick={handleStopDrawMode}>
            선 그리기 종료
          </button>

          <button style={styles.secondaryButton} onClick={handleDeleteSelectedSegment}>
            선택 선 삭제
          </button>

          <button style={styles.secondaryButton} onClick={handleClearSegments}>
            모든 선 삭제
          </button>

          <p style={styles.helpText}>
            선 그리기 시작 후 도면 위를 2번 클릭하면 선 1개가 생성됩니다.
          </p>
          <p style={styles.helpText}>
            현재 상태: <strong>{isDrawMode ? '선 그리기 중' : '대기'}</strong>
          </p>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>포스트 자동 배치</h3>

          <label style={styles.inputLabel}>최대 포스트 간격 (mm)</label>
          <input
            type="number"
            value={maxPostSpacingMm}
            onChange={(e) => setMaxPostSpacingMm(e.target.value)}
            placeholder="예: 2000"
            style={styles.input}
          />

          <button style={styles.primaryButton} onClick={handleGeneratePosts}>
            포스트 자동 생성
          </button>

          <button style={styles.secondaryButton} onClick={handleClearPosts}>
            포스트 지우기
          </button>

          <button style={styles.secondaryButton} onClick={handleDeleteSelectedPost}>
            선택 포스트 삭제
          </button>

          <p style={styles.helpText}>
            연결된 선 끝점의 중복 포스트는 자동으로 통합됩니다.
          </p>
          <p style={styles.helpText}>
            생성 후 포스트를 드래그해서 위치를 수정할 수 있습니다.
          </p>
          <p style={styles.helpText}>
            현재 포스트 수: <strong>{posts.length}</strong>
          </p>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>포스트 수동 추가 / 난간 표시</h3>

          <button style={styles.primaryButton} onClick={handleStartAddPostMode}>
            포스트 추가 모드 시작
          </button>

          <button style={styles.secondaryButton} onClick={handleStopAddPostMode}>
            포스트 추가 모드 종료
          </button>

          <button
            style={styles.secondaryButton}
            onClick={() => setShowRails((prev) => !prev)}
          >
            {showRails ? '가로 파이프 숨기기' : '가로 파이프 보이기'}
          </button>

          <p style={styles.helpText}>
            포스트 추가 모드에서 도면을 클릭하면 포스트를 직접 추가할 수 있습니다.
          </p>
          <p style={styles.helpText}>
            현재 상태: <strong>{isAddPostMode ? '포스트 추가 중' : '대기'}</strong>
          </p>
          <p style={styles.helpText}>
            가로 파이프 표시: <strong>{showRails ? 'ON' : 'OFF'}</strong>
          </p>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>단가 입력</h3>

          <label style={styles.inputLabel}>포스트 단가 (원/개)</label>
          <input
            type="number"
            value={postUnitPrice}
            onChange={(e) => setPostUnitPrice(e.target.value)}
            style={styles.input}
          />

          <label style={styles.inputLabel}>가로 파이프 단가 (원/m)</label>
          <input
            type="number"
            value={railUnitPricePerM}
            onChange={(e) => setRailUnitPricePerM(e.target.value)}
            style={styles.input}
          />

          <label style={styles.inputLabel}>클램프 단가 (원/개)</label>
          <input
            type="number"
            value={clampUnitPrice}
            onChange={(e) => setClampUnitPrice(e.target.value)}
            style={styles.input}
          />

          <label style={styles.inputLabel}>볼트 단가 (원/개)</label>
          <input
            type="number"
            value={boltUnitPrice}
            onChange={(e) => setBoltUnitPrice(e.target.value)}
            style={styles.input}
          />
        </div>
      </aside>

      <main style={styles.center}>
        <div style={styles.canvasHeader}>
          <h1 style={styles.mainTitle}>안전난간 만들기</h1>
          <p style={styles.subTitle}>Konva 도면 작업 영역</p>
        </div>

        <div style={styles.canvasArea} ref={containerRef}>
          {!htmlImage ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>📐</div>
              <div style={styles.emptyTitle}>도면 이미지를 업로드하세요</div>
              <div style={styles.emptyDesc}>
                업로드한 도면이 이 영역에 표시됩니다.
              </div>
            </div>
          ) : (
            <Stage
              width={stageSize.width}
              height={stageSize.height}
              onClick={handleStageClick}
              style={styles.stage}
            >
              <Layer>
                {imageLayout && (
                  <KonvaImage
                    image={htmlImage}
                    x={imageLayout.x}
                    y={imageLayout.y}
                    width={imageLayout.width}
                    height={imageLayout.height}
                  />
                )}

                {segmentRailLines.map((rail) => (
                  <Line
                    key={rail.id}
                    points={[rail.start.x, rail.start.y, rail.end.x, rail.end.y]}
                    stroke={rail.railIndex === 1 ? '#1d4ed8' : '#60a5fa'}
                    strokeWidth={2}
                    lineCap="round"
                  />
                ))}

                {segments.map((segment) => {
                  const isSelected = selectedSegmentId === segment.id
                  const pxLength = getDistance(segment.start, segment.end)
                  const mid = getMidPoint(segment.start, segment.end)

                  return (
                    <LayerItemGroup
                      key={segment.id}
                      segment={segment}
                      isSelected={isSelected}
                      pxLength={pxLength}
                      mmPerPx={mmPerPx}
                      mid={mid}
                      onSelect={() => {
                        setSelectedSegmentId(segment.id)
                        setSelectedPostId(null)
                      }}
                    />
                  )
                })}

                {posts.map((post) => (
                  <PostMarker
                    key={post.id}
                    post={post}
                    isSelected={selectedPostId === post.id}
                    onSelect={() => {
                      setSelectedPostId(post.id)
                      setSelectedSegmentId(null)
                    }}
                    onDragEnd={handlePostDragEnd}
                  />
                ))}

                {drawingStartPoint && (
                  <Circle
                    x={drawingStartPoint.x}
                    y={drawingStartPoint.y}
                    radius={6}
                    fill="#f59e0b"
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                )}

                {scalePoints.length === 2 && (
                  <Line
                    points={[
                      scalePoints[0].x,
                      scalePoints[0].y,
                      scalePoints[1].x,
                      scalePoints[1].y,
                    ]}
                    stroke="#2563eb"
                    strokeWidth={2}
                    dash={[8, 6]}
                  />
                )}

                {scalePoints.map((point, index) => (
                  <Circle
                    key={`${point.x}-${point.y}-${index}`}
                    x={point.x}
                    y={point.y}
                    radius={6}
                    fill="#ef4444"
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                ))}

                {lineMid && (
                  <Text
                    x={lineMid.x + 8}
                    y={lineMid.y - 20}
                    text={`${pixelDistance.toFixed(2)} px`}
                    fontSize={14}
                    fill="#111827"
                  />
                )}
              </Layer>
            </Stage>
          )}
        </div>
      </main>

      <aside style={styles.right}>
        <h2 style={styles.panelTitle}>결과 패널</h2>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>현재 상태</h3>
          <p style={styles.helpText}>
            업로드된 도면:
            <br />
            <strong>{fileName || '없음'}</strong>
          </p>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>축척 결과</h3>
          <p style={styles.helpText}>
            픽셀 거리: <strong>{pixelDistance ? pixelDistance.toFixed(2) : '-'}</strong> px
          </p>
          <p style={styles.helpText}>
            실제 거리: <strong>{realDistanceInput || '-'}</strong> mm
          </p>
          <p style={styles.helpText}>
            mm/px: <strong>{mmPerPx ? mmPerPx.toFixed(4) : '-'}</strong>
          </p>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>설치 구간 요약</h3>
          <p style={styles.helpText}>
            선 개수: <strong>{segments.length}</strong>
          </p>
          <p style={styles.helpText}>
            총 길이(px): <strong>{totalLengthPx.toFixed(2)}</strong>
          </p>
          <p style={styles.helpText}>
            총 길이(mm): <strong>{mmPerPx ? totalLengthMm.toFixed(2) : '-'}</strong>
          </p>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>포스트 / 난간 결과</h3>
          <p style={styles.helpText}>
            전체 포스트 수: <strong>{posts.length}</strong>
          </p>
          <p style={styles.helpText}>
            자동 포스트 수: <strong>{estimate.autoPostCount}</strong>
          </p>
          <p style={styles.helpText}>
            수동 포스트 수: <strong>{estimate.manualPostCount}</strong>
          </p>
          <p style={styles.helpText}>
            가로 파이프 줄 수: <strong>{showRails ? 3 : 0}</strong>
          </p>
          <p style={styles.helpText}>
            생성된 가로 파이프 수: <strong>{segmentRailLines.length}</strong>
          </p>

          {selectedPost ? (
            <div style={styles.segmentSummaryBox}>
              <div style={styles.segmentSummaryTitle}>선택 포스트</div>
              <div style={styles.segmentSummaryText}>X: {selectedPost.x.toFixed(1)}</div>
              <div style={styles.segmentSummaryText}>Y: {selectedPost.y.toFixed(1)}</div>
              <div style={styles.segmentSummaryText}>
                연결 선 수: {selectedPost.segmentIds.length}
              </div>
              <div style={styles.segmentSummaryText}>
                수동 추가: {selectedPost.isManual ? '예' : '아니오'}
              </div>
            </div>
          ) : (
            <p style={styles.helpText}>선택된 포스트가 없습니다.</p>
          )}

          {segmentSummaries.map((item, index) => (
            <div key={item.id} style={styles.segmentSummaryBox}>
              <div style={styles.segmentSummaryTitle}>선 {index + 1}</div>
              <div style={styles.segmentSummaryText}>
                길이(px): {item.pxLength.toFixed(1)}
              </div>
              <div style={styles.segmentSummaryText}>
                길이(mm): {item.mmLength ? item.mmLength.toFixed(1) : '-'}
              </div>
              <div style={styles.segmentSummaryText}>
                포스트 수: {item.postCount}
              </div>
            </div>
          ))}
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>BOM / 견적</h3>

          <div style={styles.bomRow}>
            <span>포스트</span>
            <span>{estimate.totalPostCount} 개</span>
          </div>
          <div style={styles.bomRow}>
            <span>가로 파이프</span>
            <span>{estimate.railTotalM.toFixed(2)} m</span>
          </div>
          <div style={styles.bomRow}>
            <span>클램프</span>
            <span>{estimate.clampCount} 개</span>
          </div>
          <div style={styles.bomRow}>
            <span>볼트</span>
            <span>{estimate.boltCount} 개</span>
          </div>

          <div style={styles.divider} />

          <div style={styles.bomRow}>
            <span>포스트 금액</span>
            <strong>{formatWon(estimate.postAmount)}</strong>
          </div>
          <div style={styles.bomRow}>
            <span>가로 파이프 금액</span>
            <strong>{formatWon(estimate.railAmount)}</strong>
          </div>
          <div style={styles.bomRow}>
            <span>클램프 금액</span>
            <strong>{formatWon(estimate.clampAmount)}</strong>
          </div>
          <div style={styles.bomRow}>
            <span>볼트 금액</span>
            <strong>{formatWon(estimate.boltAmount)}</strong>
          </div>

          <div style={styles.divider} />

          <div style={styles.totalRow}>
            <span>총 금액</span>
            <strong>{formatWon(estimate.totalAmount)}</strong>
          </div>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>다음 단계 예정</h3>
          <p style={styles.helpText}>- 3D 뷰어 연결</p>
          <p style={styles.helpText}>- PDF/이미지 결과 출력</p>
          <p style={styles.helpText}>- GitHub Pages 배포 설정</p>
        </div>
      </aside>
    </div>
  )
}

function LayerItemGroup({ segment, isSelected, pxLength, mmPerPx, mid, onSelect }) {
  const mmLength = mmPerPx ? pxLength * mmPerPx : null

  return (
    <>
      <Line
        points={[segment.start.x, segment.start.y, segment.end.x, segment.end.y]}
        stroke={isSelected ? '#dc2626' : '#16a34a'}
        strokeWidth={isSelected ? 4 : 3}
        onClick={(e) => {
          e.cancelBubble = true
          onSelect()
        }}
      />

      <Circle
        x={segment.start.x}
        y={segment.start.y}
        radius={5}
        fill={isSelected ? '#dc2626' : '#16a34a'}
        stroke="#ffffff"
        strokeWidth={2}
        onClick={(e) => {
          e.cancelBubble = true
          onSelect()
        }}
      />

      <Circle
        x={segment.end.x}
        y={segment.end.y}
        radius={5}
        fill={isSelected ? '#dc2626' : '#16a34a'}
        stroke="#ffffff"
        strokeWidth={2}
        onClick={(e) => {
          e.cancelBubble = true
          onSelect()
        }}
      />

      <Text
        x={mid.x + 8}
        y={mid.y + 8}
        text={
          mmLength
            ? `${pxLength.toFixed(1)} px / ${mmLength.toFixed(1)} mm`
            : `${pxLength.toFixed(1)} px`
        }
        fontSize={14}
        fill="#111827"
        onClick={(e) => {
          e.cancelBubble = true
          onSelect()
        }}
      />
    </>
  )
}

function PostMarker({ post, isSelected, onSelect, onDragEnd }) {
  return (
    <>
      <Circle
        x={post.x}
        y={post.y}
        radius={isSelected ? 9 : 7}
        fill={post.isManual ? (isSelected ? '#b45309' : '#f59e0b') : isSelected ? '#dc2626' : '#111827'}
        stroke="#ffffff"
        strokeWidth={2}
        draggable
        onClick={(e) => {
          e.cancelBubble = true
          onSelect()
        }}
        onDragStart={(e) => {
          e.cancelBubble = true
          onSelect()
        }}
        onDragEnd={(e) => {
          onDragEnd(post.id, e.target.x(), e.target.y())
        }}
      />
      <Text
        x={post.x + 8}
        y={post.y - 8}
        text={post.isManual ? 'M' : String(post.segmentIds.length)}
        fontSize={12}
        fill={post.isManual ? '#92400e' : isSelected ? '#dc2626' : '#111827'}
        onClick={(e) => {
          e.cancelBubble = true
          onSelect()
        }}
      />
    </>
  )
}

function getDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function getMidPoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }
}

function interpolatePoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  }
}

function projectionRatioOnSegment(point, segment) {
  const ax = segment.start.x
  const ay = segment.start.y
  const bx = segment.end.x
  const by = segment.end.y
  const abx = bx - ax
  const aby = by - ay
  const apx = point.x - ax
  const apy = point.y - ay
  const abLenSq = abx * abx + aby * aby

  if (abLenSq === 0) return 0
  return (apx * abx + apy * aby) / abLenSq
}

function getOffsetSegment(a, b, offset) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)

  if (len === 0) {
    return { start: a, end: b }
  }

  const nx = -dy / len
  const ny = dx / len

  return {
    start: { x: a.x + nx * offset, y: a.y + ny * offset },
    end: { x: b.x + nx * offset, y: b.y + ny * offset },
  }
}

function distancePointToSegment(point, a, b) {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const apx = point.x - a.x
  const apy = point.y - a.y
  const abLenSq = abx * abx + aby * aby

  if (abLenSq === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y)
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq))
  const closestX = a.x + abx * t
  const closestY = a.y + aby * t

  return Math.hypot(point.x - closestX, point.y - closestY)
}

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function mergeNearbyPosts(rawPosts, tolerancePx = 10) {
  const groups = []

  rawPosts.forEach((post) => {
    let matchedGroup = null

    for (const group of groups) {
      const dist = Math.hypot(post.x - group.x, post.y - group.y)
      if (dist <= tolerancePx) {
        matchedGroup = group
        break
      }
    }

    if (!matchedGroup) {
      groups.push({
        x: post.x,
        y: post.y,
        items: [post],
      })
    } else {
      matchedGroup.items.push(post)
      const count = matchedGroup.items.length
      matchedGroup.x =
        matchedGroup.items.reduce((sum, item) => sum + item.x, 0) / count
      matchedGroup.y =
        matchedGroup.items.reduce((sum, item) => sum + item.y, 0) / count
    }
  })

  return groups.map((group) => {
    const segmentIdSet = new Set()
    const sourceItems = []

    group.items.forEach((item) => {
      item.segmentIds.forEach((segId) => segmentIdSet.add(segId))
      sourceItems.push(...item.sourceItems)
    })

    return {
      id: createId(),
      x: group.x,
      y: group.y,
      segmentIds: [...segmentIdSet],
      sourceItems,
      isManual: false,
    }
  })
}

function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function formatWon(value) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`
}

const styles = {
  app: {
    display: 'grid',
    gridTemplateColumns: '320px 1fr 360px',
    height: '100vh',
    background: '#f3f4f6',
    color: '#111827',
    fontFamily: 'Arial, sans-serif',
  },
  left: {
    padding: '20px',
    borderRight: '1px solid #d1d5db',
    background: '#ffffff',
    overflowY: 'auto',
  },
  center: {
    padding: '20px',
    background: '#f9fafb',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  right: {
    padding: '20px',
    borderLeft: '1px solid #d1d5db',
    background: '#ffffff',
    overflowY: 'auto',
  },
  panelTitle: {
    margin: '0 0 20px 0',
    fontSize: '20px',
    fontWeight: 700,
  },
  section: {
    marginBottom: '24px',
    padding: '16px',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    background: '#fafafa',
  },
  sectionTitle: {
    margin: '0 0 12px 0',
    fontSize: '16px',
    fontWeight: 700,
  },
  helpText: {
    margin: '6px 0',
    fontSize: '14px',
    lineHeight: 1.5,
    color: '#4b5563',
  },
  primaryButton: {
    width: '100%',
    padding: '12px 14px',
    border: 'none',
    borderRadius: '10px',
    background: '#111827',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    marginBottom: '10px',
  },
  secondaryButton: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '10px',
    background: '#ffffff',
    color: '#111827',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: '10px',
  },
  fileBox: {
    marginTop: '14px',
    padding: '12px',
    borderRadius: '10px',
    background: '#ffffff',
    border: '1px solid #e5e7eb',
  },
  fileName: {
    fontSize: '13px',
    color: '#111827',
    wordBreak: 'break-all',
  },
  inputLabel: {
    display: 'block',
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    marginBottom: '10px',
  },
  infoBox: {
    marginTop: 8,
    padding: '12px',
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
  },
  infoLine: {
    fontSize: '13px',
    color: '#374151',
    marginBottom: '6px',
  },
  canvasHeader: {
    marginBottom: '16px',
  },
  mainTitle: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 700,
  },
  subTitle: {
    margin: '6px 0 0 0',
    fontSize: '14px',
    color: '#6b7280',
  },
  canvasArea: {
    flex: 1,
    minHeight: 0,
    border: '1px solid #d1d5db',
    borderRadius: '16px',
    background: '#ffffff',
    overflow: 'hidden',
    position: 'relative',
  },
  stage: {
    background: '#e5e7eb',
    display: 'block',
  },
  emptyState: {
    margin: 'auto',
    textAlign: 'center',
    color: '#6b7280',
    padding: '20px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: '42px',
    marginBottom: '12px',
  },
  emptyTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#111827',
    marginBottom: '6px',
  },
  emptyDesc: {
    fontSize: '14px',
    color: '#6b7280',
  },
  segmentSummaryBox: {
    marginTop: '10px',
    padding: '10px',
    borderRadius: '10px',
    border: '1px solid #e5e7eb',
    background: '#ffffff',
  },
  segmentSummaryTitle: {
    fontSize: '13px',
    fontWeight: 700,
    marginBottom: '6px',
    color: '#111827',
  },
  segmentSummaryText: {
    fontSize: '13px',
    color: '#4b5563',
    marginBottom: '4px',
  },
  bomRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
    fontSize: '14px',
    color: '#374151',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginTop: '8px',
    fontSize: '16px',
    color: '#111827',
  },
  divider: {
    height: '1px',
    background: '#e5e7eb',
    margin: '12px 0',
  },
}

export default App