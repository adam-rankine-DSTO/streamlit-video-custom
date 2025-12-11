import subprocess
import os
import fiftyone as fo
import fiftyone.zoo as foz
from fiftyone.types import COCODetectionDataset


def convert_coco(
    coco_dataset_dir,
    output_dataset_name,
    video_output_path=None,
    fps=30
):
    images_dir = os.path.join(coco_dataset_dir, "data")
    labels_path = os.path.join(coco_dataset_dir, "labels.json")

    if video_output_path is None:
        video_output_path = os.path.join(coco_dataset_dir, f"{output_dataset_name}.mp4")

    temp_name = f"{output_dataset_name}_temp"

    if fo.dataset_exists(temp_name):
        fo.delete_dataset(temp_name)

    dataset = fo.Dataset.from_dir(
        dataset_type=COCODetectionDataset,
        data_path=images_dir,
        labels_path=labels_path,
        name=temp_name
    )

    dataset.sort_by("filepath")

    tmp_dir = os.path.join(coco_dataset_dir, "_tmp_frames")
    os.makedirs(tmp_dir, exist_ok=True)

    for i, sample in enumerate(dataset):
        ext = os.path.splitext(sample.filepath)[1]
        numbered = os.path.join(tmp_dir, f"frame_{i:06d}{ext}")

        if not os.path.exists(numbered):
            try:
                os.symlink(sample.filepath, numbered)
            except:
                import shutil
                shutil.copy(sample.filepath, numbered)

    cmd = [
        "ffmpeg",
        "-y",
        "-framerate", str(fps),
        "-i", os.path.join(tmp_dir, "frame_%06d.jpg"),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        video_output_path
    ]
    subprocess.run(cmd, check=True)

    if fo.dataset_exists(output_dataset_name):
        fo.delete_dataset(output_dataset_name)

    video_dataset = fo.Dataset(output_dataset_name)
    sample = fo.Sample(filepath=video_output_path)
    sample["frames"] = {}

    for i, img_sample in enumerate(dataset):
        frame_num = i + 1
        det = img_sample["detections"]
        sample.frames[frame_num] = fo.Frame(detections=det)

    video_dataset.add_sample(sample)

    dataset.delete()

    return video_dataset
