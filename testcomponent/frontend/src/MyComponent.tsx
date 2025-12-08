import { ComponentArgs } from "@streamlit/component-v2-lib";
import {
  FC,
  ReactElement,
  useCallback,
  useState,
  useRef,
  useEffect
} from "react";

export type MyComponentStateShape = {
  current_timestamp: number;
};

export type MyComponentDataShape = {
  seek_to?: number;
  detections: any;
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
 * @param props.seek- Video source passed from the Python side to display video
 * @param props.setStateValue - Function to send state updates back to Streamlit
 * @returns The rendered component
 */
const MyComponent: FC<MyComponentProps> = ({
  seek_to,
  detections,
  src,
  setStateValue,
}): ReactElement => {
  // Video tag reference
  const videoRef = useRef<HTMLVideoElement>(null);

  // Frontend component state
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (seek_to && videoRef.current) {
      videoRef.current.currentTime = seek_to;
    }
  }, [seek_to]);

  /**
   * Click handler for the button
   * Callback updates on dependency array and sends state data base to Streamlit (setStateValue)
   */
  const handleTimeUpdate = useCallback((): void => {
    if (videoRef.current) {
      // Update react component state
      setCurrentTime(videoRef.current.currentTime);

      // Send state value back to Streamlit (will be available in Python)
      setStateValue("current_timestamp", videoRef.current.currentTime);
    }
  }, [currentTime, setStateValue]);

  return (
    <div>
      <video
        ref={videoRef}
        src={src}
        controls
        onTimeUpdate={handleTimeUpdate}
        style={{ width: "100%", maxWidth: "100%" }}
      >
      </video>
    </div>
  );
};

export default MyComponent;
