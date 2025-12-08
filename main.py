import streamlit as st
import fiftyone as fo
import base64
from testcomponent import testcomponent


FIFTYONE_DATASET_NAME = "quickstart-video"


def extract_detections_from_fiftyone(sample):
    detections_by_frame = {}

    for frame_number, frame in sample.frames.items():
        if hasattr(frame, "detections") and frame.detections is not None:
            frame_detections = []

            for detection in frame.detections.detections:
                bbox = detection.bounding_box
                
                frame_detections.append({
                    "x": bbox[0],
                    "y": bbox[1],
                    "width": bbox[2],
                    "height": bbox[3],
                    "label": detection.label,
                    "confidence": detection.confidence if hasattr(detection, "confidence") else 1.0
                })
            detections_by_frame[frame_number - 1] = frame_detections

    return detections_by_frame

def render_video_with_detections(src, detections, seek_to=None, fps=30, key=None):
    with open(src, "rb") as f:
        video_bytes = f.read()
    video_base64 = base64.b64encode(video_bytes).decode()
    video_url = f"data:video/mp4;base64,{video_base64}"

    component_ouput = testcomponent(
        src=video_url,
        detections=detections,
        seek_to=seek_to,
        fps=fps,
        key=key
    )

    return component_ouput


def main():
    with st.spinner():
        try:
            dataset = fo.load_dataset(FIFTYONE_DATASET_NAME)
            st.toast(f"Loaded existing dataset: {dataset.name}", icon="✅")
        except:
            st.toast(f"Downloading dataset from FiftyOne Zoo...")
            import fiftyone.zoo as foz
            dataset = foz.load_zoo_dataset(FIFTYONE_DATASET_NAME)
            st.toast(f"Loaded existing dataset: {dataset.name}", icon="✅")

        if "seek_ts" not in st.session_state:
            st.session_state.seek_ts = 0

        st.header("Bounding Box Video Component")

        sample = dataset.first()
        video_samples = list(dataset)
        if not video_samples:
            st.error("No video samples found in dataset")
            return

        st.sidebar.markdown(f"""
        **Dataset Metadata**
        - Dataset name: {dataset.name}
        - Total videos: {len(video_samples)}
        - Media type: {dataset.media_type}
        """)

        # Make this selection a single row selection from a dataframe
        sample_names = [f"Video {i + 1}: {s.filepath.split("/")[-1]}" for i, s in enumerate(video_samples)]
        selected_idx = st.sidebar.selectbox(
            "**Select Video**",
            range(len(sample_names)),
            format_func=lambda i: sample_names[i]
        )
        sample = video_samples[selected_idx]

        if sample.metadata is None:
            with st.spinner("Computing video metadata"):
                sample.compute_metadata()

        fps = sample.metadata.frame_rate if sample.metadata and sample.metadata.frame_rate else 30
        total_frames = sample.metadata.total_frame_count if sample.metadata else "Unknown"
        duration = sample.metadata.duration if sample.metadata else "Unknown"
        resolution = f"{sample.metadata.frame_width}x{sample.metadata.frame_height}" if sample.metadata else "Unknown"

        st.sidebar.divider()
        st.sidebar.markdown("**Sample Metadata**")
        st.sidebar.metric("Frame Rate", f"{fps:.2f} fps")
        st.sidebar.metric("Total Frames", total_frames)
        st.sidebar.metric("Duration", f"{duration:.2f}s")
        st.sidebar.metric("Resolution", resolution)

        with st.spinner("Extracting detections..."):
            detections = extract_detections_from_fiftyone(sample)

        st.info(f"Successfully loaded {len(detections)} frames with detections", icon="📊")

        total_detections = sum(len(dets) for dets in detections.values())
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Total Detections", total_detections)
        with col2:
            st.metric("Frames with Detections", len(detections))
        with col3:
            avg_per_frame = total_detections / len(detections) if detections else 0
            st.metric("Average detections per frame", f"{avg_per_frame:.1f}")

        all_labels = set()
        for frame_dets in detections.values():
            for det in frame_dets:
                all_labels.add(det["label"])

        if all_labels:
            st.markdown(f"**Detected classes:** {', '.join(sorted(all_labels))}")

        st.divider()


        st.session_state.seek_ts = st.text_input("Seek to: ", value=st.session_state.seek_ts)

        result = render_video_with_detections(
            src=sample.filepath,
            detections=detections,
            seek_to=st.session_state.seek_ts,
            fps=fps,
        )

        st.write(result)


# result = testcomponent(
#     video_url, 
#     seek_to=st.session_state.seek_ts,
#     fps=
# )

# result = testcomponent(seek_to=st.session_state.seek_ts, src="./mov_bbb.mp4")

# st.markdown(f"Current timestamp: {result["current_timestamp"]}")


if __name__ == "__main__":
    main()
