import { ComponentArgs } from "@streamlit/component-v2-lib";
import "./styles.css";
import {
  FC,
  ReactElement,
  useCallback,
  useState,
  useRef,
  useEffect
} from "react";

interface SegmentData {
  normalized: number;
  count: number;
  startFrame: number;
  endFrame: number;
  bucketSize: number;
}

export type Detection = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  confidence: number;
}

export type MyComponentStateShape = {
  current_timestamp: number;
  current_frame: number;
};

export type MyComponentDataShape = {
  seek_to?: number;
  detections: Record<number, Array<Detection>>;
  fps: number;
  src: string;
};

export type MyComponentProps = Pick<
  ComponentArgs<MyComponentStateShape, MyComponentDataShape>,
  "setStateValue"
> &
  MyComponentDataShape;

/**
 * Video player for seeking to and getting current timestamp
 *
 * @param props.src - Video source passed from the Python side to display video
 * @param props.seek - Video source passed from the Python side to display video
 * @param props.detections - Video source detections passed from the Python side to display bouding boxes and detection timeslines
 * @param props.fps - Video source fps passed from the Python side to sync detections with video frames
 * @param props.setStateValue - Function to send state updates back to Streamlit
 * @returns The rendered component
 */
const MyComponent: FC<MyComponentProps> = ({
  seek_to,
  detections,
  fps,
  src,
  setStateValue,
}): ReactElement => {
  // Video element reference
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Canvas element reference
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Frontend component state
  const [currentTime, setCurrentTime] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);

  useEffect(() => {
    if (seek_to && videoRef.current) {
      videoRef.current.currentTime = seek_to;
    }
  }, [seek_to]);
  
  // useEffect(() => {
  //   const video = videoRef.current;
  //
  //   if (!video) { return; }
  //
  //   const handleLoadedMetadata = () => {
  //     if (!video.duration && !isNaN(video.duration)) {
  //     }
  //   }
  //
  //   video.addEventListener("loadedmetadata", handleLoadedMetadata);
  //
  //   return () => {
  //     if (video) {
  //       video.removeEventListener("loadedmetadata", handleLoadedMetadata);
  //     }
  //   };
  // }, [src, fps, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) { return; }

    (() => {
      const ctx = canvas.getContext("2d");

      if (!ctx) { return; }

      const frameDetections = detections[currentFrame] || [];
      ctx?.clearRect(0, 0, canvas.width, canvas.height)

      const { videoWidth, videoHeight } = video;

      if (videoWidth === 0 || videoHeight === 0) { return; }

      frameDetections.forEach((det) => {
        const x = det.x * videoWidth;
        const y = det.y * videoHeight;
        const width = det.width * videoWidth;
        const height = det.height * videoHeight;

        const color = getColorForLabel(det.label);

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, width, height);

        const label = `${det.label} ${(det.confidence * 100).toFixed(0)}%`;
        ctx.font = 'bold 16px sans-serif';
        ctx.textBaseline = 'top';
        const textMetrics = ctx.measureText(label);
        const padding = 6;
        const textHeight = 20;

        ctx.fillStyle = color;
        ctx.fillRect(x, y - textHeight - padding, textMetrics.width + padding * 2, textHeight + padding);

        ctx.fillStyle = "white";
        ctx.fillText(label, x + padding, y - (textHeight - padding / 2));
      })
    })();
  }, [currentFrame, detections]);

  const getColorForLabel = (label: string) => {
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
      hash = label.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 85%, 55%)`;
  }

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) { return; }

    setTotalFrames(Math.floor(video.duration * fps));
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  const getDetectionDensity = (): Array<SegmentData> => {
    if (totalFrames === 0) return [];

    const bucketSize = Math.max(1, Math.floor(totalFrames / 200));
    const numBuckets = Math.ceil(totalFrames / bucketSize);
    const density = new Array(numBuckets).fill(0);
    const detectionCounts = new Array(numBuckets).fill(0);

    Object.entries(detections).forEach(([frameNum, dets]) => {
      const bucketIndex = Math.floor(parseInt(frameNum) / bucketSize);
      if (bucketIndex < numBuckets) {
        density[bucketIndex] += dets.length;
        detectionCounts[bucketIndex] += dets.length;
      }
    });

    const maxDensity = Math.max(...density, 1);
    const normalizedDensity = density.map((d) => d / maxDensity);

    return normalizedDensity.map((norm, i) => ({
      normalized: norm,
      count: detectionCounts[i],
      startFrame: i * bucketSize,
      endFrame: Math.min((i + 1) * bucketSize - 1, totalFrames - 1),
      bucketSize: bucketSize
    }));
  };

  const getClassDistribution = () => {
    const currentDetections = detections[currentFrame] || [];
    const distribution = {};

    currentDetections.forEach((detection) => {
      distribution[detection.label] = (distribution[detection.label] || 0) + 1;
    });

    return Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  }

  const detectionDensity = getDetectionDensity();
  const classDistribution = getClassDistribution();
  const currentDetections = detections[currentFrame] || [];

  /**
   * Click handler for the button
   * Callback updates on dependency array and sends state data base to Streamlit (setStateValue)
   */
  const handleTimeUpdate = useCallback((): void => {
    const video = videoRef.current;

    if (!video) { return; }

    // Update react component state
    setCurrentTime(video.currentTime);
    // Send state value back to Streamlit (will be available in Python)
    setStateValue("current_timestamp", video.currentTime);

    // set current frame and send back to Streamlit
    const frame = Math.floor(video.currentTime * fps);
    setCurrentFrame(frame);
    setStateValue("current_frame", frame);
  }, [currentTime, setStateValue]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  const handleTimelineClick = (segmentData: SegmentData) => {
    const video = videoRef.current;

    if (!video || !fps) { return; }

    const targetTime = segmentData.startFrame / fps;
    video.currentTime = targetTime;
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      width: "100%",
      maxWidth: "1200px",
      margin: "0 auto",
    }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", overflow: "hidden"}}>
        <video
          ref={videoRef}
          src={src}
          controls
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          style={{ width: "100%", height: "100%", objectFit: "contain"}}
        />
        {/* conditionally render canvas with props and processing (probably wont need it) */}
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            objectFit: "contain",
            zIndex: "100"
          }}
        />
        <div 
          style={{
            position: "absolute",
            padding: "8px 12px",
            borderRadius: "8px",
            fontFamily: "'Courier New', monospace",
            fontSize: "14px",
            fontWeight: "bold",
            backdropFilter: "blur(10px)",
            top: "16px",
            left: "16px",
            color: "#00ff88"
          }}
        >
          Frame: {currentFrame} / {totalFrames}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%" }}>
        <div style={{ gap: "20px"}}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", marginBottom: "12px"}}>
            <h3 style={{ fontSize: "18px", fontWeight: "600", margin: "0" }}>Detection Timeline</h3>
            <span style={{ color: "#9ca3af", fontSize: "13px" }}>
              Activity across video duration
            </span>
          </div>

          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", height: "60px", gap: "1px", position: "relative"}}>
              {detectionDensity.map((density, i: number) => (
                <div
                  key={i}
                  className="timeline-bar"
                  onMouseEnter={() => setHoveredSegment(i)}
                  onMouseLeave={() => setHoveredSegment(null)}
                  onClick={() => handleTimelineClick(density)}
                  style={{
                    height: `${Math.max(density.normalized * 100, 2)}%`,
                    backgroundColor: density.normalized > 0.7 ? "#ef4444" : density.normalized > 0.4 ? "#f59e0b" : density.normalized > 0 ? "#10b981" : "#374151",
                    flex: "1",
                    minWidth: "2px",
                    borderRadius: "2px 2px 0 0",
                    transition: "all 0.2s ease",
                    opacity: hoveredSegment === i ? "0.8" : "1",
                    transform: hoveredSegment === i ? "scale(1.1)" : "",
                    cursor: hoveredSegment === i ? "pointer" : ""
                  }}
                  title={`
                  `}
                >
                  {/* Segment hover tooltip */}
                  {hoveredSegment === i && (
                    <div 
                      style={{
                        position: "absolute",
                        display: "flex",
                        flexDirection: "column",
                        bottom: "100%",
                        left: "50%",
                        transform: "translateX(-50%)",
                        marginBottom: "8px",
                        backgroundColor: "rgba(0, 0, 0, 0.9)",
                        color: "#fff",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        whiteSpace: "nowrap",
                        zIndex: "1000",
                        pointerEvents: "none",
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)"
                      }}
                    >
                      <span>Segment: {`${i + 1}`}</span>
                      <span>Detections: {`${density.count}`}</span>
                      <span>Start Time: {`${formatTime(density.startFrame / fps)}`}</span>
                      <span>End Frame: {`${formatTime(density.endFrame / fps)}`}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div
              style={{ 
                width: `${(currentFrame / totalFrames) * 100}%`, 
                position: "absolute", 
                top: "-5px",
                height: "65px", 
                pointerEvents: "none", 
                zIndex: "5"
              }}
            >
              <div
                style={{ 
                  position: "absolute", 
                  right: "0", 
                  top: "0", 
                  width: "3px", 
                  height: "100%", 
                  backgroundColor: "#3b82f6", 
                  boxShadow: "0 0 8px rgba(59, 130, 246, 0.8)" 
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "16px", alignItems: "center", justifyContent: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#9ca3af"}}>
                <div style={{ backgroundColor: "#10b981", width: "12px", height: "12px", borderRadius: "2px" }} />
                <span>Low</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#9ca3af"}}>
                <div style={{ backgroundColor: "#f59e0b", width: "12px", height: "12px", borderRadius: "2px" }} />
                <span>Medium</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#9ca3af"}}>
                <div style={{ backgroundColor: "#ef4444", width: "12px", height: "12px", borderRadius: "2px" }} />
                <span>High</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* TODO: current frame stats */}
      {/* TODO: class distribution across frames */}
    </div>
  );
};

export default MyComponent;
