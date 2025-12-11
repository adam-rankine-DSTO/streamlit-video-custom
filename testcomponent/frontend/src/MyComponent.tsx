import { ComponentArgs } from "@streamlit/component-v2-lib";
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

interface SelectedSegment {
  start: number;
  end: number;
}

export type MyComponentDataShape = {
  seek_to?: number;
  detections: Record<number, Array<Detection>>;
  fps: number;
  src: string;
  selected_segments: Array<SelectedSegment>;
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
  selected_segments,
  setStateValue,
}): ReactElement => {
  // Video element reference
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Canvas element reference
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Frontend component state
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);
  const [hoveredHighlightedSegment, setHoveredHighlightedSegment] = useState<number | null>(null);

  useEffect(() => {
    if (seek_to && videoRef.current) {
      videoRef.current.currentTime = seek_to;
    }
  }, [seek_to]);

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
    setDuration(video.duration)
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

  const getClassDistribution = (): Array<[string, number]> => {
    const currentDetections = detections[currentFrame] || [];
    const distribution: { [key: string]: number } = {};

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

  const handleSegmentClick = (index: number) => {
    const video = videoRef.current;

    if (!video || !fps) { return; }

    const targetTime = selected_segments[index].start;
    video.currentTime = targetTime;
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "20px",
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "600", margin: "0" }}>Detection Timeline</h3>
            <span style={{ color: "#9ca3af", fontSize: "13px" }}>
              Activity across video duration
            </span>
          </div>

          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "1px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", height: "60px", gap: "1px", position: "relative"}}>
              {detectionDensity.map((density, i: number) => (
                <div
                  key={i}
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
                >
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
                      <span>Start time: {`${formatTime(density.startFrame / fps)}`}</span>
                      <span>End time: {`${formatTime(density.endFrame / fps)}`}</span>
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
                  boxShadow: "0 0 8px rgba(59, 130, 246, 0.8)", 
                  borderRadius: "6px"
                }}
              />
            </div>

            {selected_segments.length !== 0 && (
              <div style={{ 
                position: "relative",
                height: "5px",
                display: "flex", 
                flexDirection: "row", 
                border: "black", 
                borderRadius: "2px",
                width: "100%"
              }}>
                {duration && selected_segments.map((segment, i) => {
                  const segStart = (segment.start / duration) * 100;
                  const segWidth = ((segment.end - segment.start) / duration) * 100;

                  return (
                    <div
                      key={i}
                      style={{
                        position: "absolute",
                        left: `${segStart}%`,
                        width: `${segWidth}%`,
                        height: "100%",
                        background: "#800080",
                        borderRadius: "2px",
                        opacity: hoveredHighlightedSegment === i ? "0.8" : "1",
                        transform: hoveredHighlightedSegment === i ? "scale(1.1)" : "",
                        transition: "all 0.2s ease",
                        cursor: hoveredHighlightedSegment === i ? "pointer" : ""
                      }}
                      onMouseEnter={() => setHoveredHighlightedSegment(i)}
                      onMouseLeave={() => setHoveredHighlightedSegment(null)}
                      onClick={() => handleSegmentClick(i)}
                    >
                    {hoveredHighlightedSegment === i && (
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
                        <span>Clip: {`${i + 1}`}</span>
                        <span>Start timestamp: {`${formatTime(segment.start)}`}</span>
                        <span>End timestamp: {`${formatTime(segment.end)}`}</span>
                      </div>
                    )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", gap: "16px", alignItems: "center", justifyContent: "center", marginTop: "12px" }}>
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
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#9ca3af"}}>
                <div style={{ backgroundColor: "#800080", width: "12px", height: "12px", borderRadius: "2px" }} />
                <span>Selected Clips</span>
              </div>
            </div>

          </div>
        </div>
      </div>

      <div style={{ width: "100%" }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px"
        }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", marginBottom: "12px"}}>
            <h3 style={{ fontSize: "18px", fontWeight: "600", margin: "0" }}>Current Frame Data</h3>
            <span style={{ color: "#9ca3af", fontSize: "13px" }}>
              Amount of objects in the current frame
            </span>
          </div>
        </div>

        <div style={{
          display: "grid",
          placeItems: "center",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "16px",
          marginBottom: "20px"
        }}>
          <div style={{
            borderRadius: "10px",
            padding: "16px",
            display: "flex",
            alignItems: "center",
            gap: "12px"
          }}>
            <div style={{ fontSize: "28px" }}>⿻</div>
            <div style={{ flex: "1" }}>
              <div style={{
                color: "#9ca3af",
                fontSize: "12px",
                marginBottom: "4px",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                Frame
              </div>
              <div style={{
                color: "#fff",
                fontSize: "24px",
                fontWeight: "bold"
              }}>
                {currentFrame}
              </div>
            </div>
          </div>

          <div style={{
            borderRadius: "10px",
            padding: "16px",
            display: "flex",
            alignItems: "center",
            gap: "12px"
          }}>
            <div style={{ fontSize: "28px" }}>📦</div>
            <div style={{ flex: "1" }}>
              <div style={{
                color: "#9ca3af",
                fontSize: "12px",
                marginBottom: "4px",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                Detections
              </div>
              <div style={{
                color: "#fff",
                fontSize: "24px",
                fontWeight: "bold"
              }}>
                {currentDetections.length}
              </div>
            </div>
          </div>

          <div style={{
            borderRadius: "10px",
            padding: "16px",
            display: "flex",
            alignItems: "center",
            gap: "12px"
          }}>
            <div style={{ fontSize: "28px" }}>🏷️</div>
            <div style={{ flex: "1" }}>
              <div style={{
                color: "#9ca3af",
                fontSize: "12px",
                marginBottom: "4px",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                Classes
              </div>
              <div style={{
                color: "#fff",
                fontSize: "24px",
                fontWeight: "bold"
              }}>
                {classDistribution.length}
              </div>
            </div>
          </div>

        </div>
      </div>

      {classDistribution.length !== 0 && (
        <div style={{ width: "100%"}}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", marginBottom: "12px"}}>
            <h3 
              style={{ 
                fontSize: "18px", 
                fontWeight: "600", 
                margin: "0", 
                marginBottom: "20px" 
              }}>
                Object Classes
            </h3>
            <span style={{ color: "#9ca3af", fontSize: "13px" }}>
              What you are seeing in the current frame
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {classDistribution.map(([label, count]) => (
              <div 
                key={label} 
                style={{
                  display: "grid",
                  gridTemplateColumns: "150px 1fr 40px",
                  alignItems: "center",
                  gap: "12px"
                }}
              >
                <div 
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "#d1d5db",
                    fontSize: "13px"
                  }}
                >
                  <div
                    style={{ 
                      backgroundColor: getColorForLabel(label),
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      flexShrink: 0
                    }}
                  />
                  <span>{label}</span>
                </div>
                <div 
                  style={{
                    height: "8px",
                    backgroundColor: "#374151",
                    borderRadius: "4px",
                    overflow: "hidden"
                  }}
                >
                  <div
                    style={{
                      width: `${(count / currentDetections.length) * 100}%`,
                      backgroundColor: getColorForLabel(label),
                      height: "100%",
                      borderRadius: "4px",
                      transition: "width 0.3 ease"
                    }}
                  />
                </div>
                <div 
                  style={{
                    color: "#9ca3af",
                    fontSize: "13px",
                    fontWeight: "600",
                    textAlign: "right"
                  }}
                >
                  {count}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {currentDetections.length > 0 && (
        <div style={{ width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", marginBottom: "12px"}}>
            <h3 style={{ fontSize: "18px", fontWeight: "600", margin: "0", marginBottom: "20px" }}>
              Detection Details
            </h3>
            <span style={{ color: "#9ca3af", fontSize: "13px" }}>
              All of the detections in the current frame
            </span>
          </div>

          <div 
            style={{
              display: "flex", 
              flexDirection: "column",
              gap: "8px",
              maxHeight: "300px",
              overflowY: "auto",
            }}
          >
            {currentDetections.map((det, i) => (
              <div 
                key={i} 
                className="detection-item"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  transition: "all 0.2s ease"
                }}
              >
                <div 
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <div
                    className="color-dot"
                    style={{ 
                      backgroundColor: getColorForLabel(det.label),
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      flexShrink: 0
                    }}
                  />
                  <span style={{ color: "#fff", fontWeight: "500", fontSize: "14px" }}>{det.label}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span 
                    style={{
                      color: "#4caf50",
                      fontSize: "13px",
                      fontFamily: "monospace",
                      fontWeight: "600"
                    }}
                  >
                    {(det.confidence * 100).toFixed(1)}%
                  </span>
                  <span 
                    style={{
                      color: "#6b7280",
                      fontSize: "11px",
                      fontFamily: "monospace"
                    }}
                  >
                    [{(det.x * 100).toFixed(0)}, {(det.y * 100).toFixed(0)}]
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MyComponent;
