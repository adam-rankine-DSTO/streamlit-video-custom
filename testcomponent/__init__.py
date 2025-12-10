import streamlit as st

out = st.components.v2.component(
    "testcomponent.testcomponent",
    js="index-*.js",
    html='<div class="react-root"></div>',
)


def on_current_timestamp_change():
    """Callback function for when current timestamp changes in the frontend."""
    pass

def on_current_frame_change():
    """Callback function for when the current frame changes in the frontend."""
    pass


# Create a wrapper function for the component.
#
# This is an optional best practice. We could simply expose the component
# function returned by `st.components.v2.component` and call it done.
#
# The wrapper allows us to customize our component's API: we can pre-process its
# input args, post-process its output value, and add a docstring for users.
def testcomponent(src, seek_to, detections, fps, selected_segments=[], key=None):
    component_value = out(
        key=key,
        default={"current_timestamp": 0, "current_frame": 0},
        data={"seek_to": seek_to, "src": src, "detections": detections, "fps": fps, "selected_segments": selected_segments},
        on_current_timestamp_change=on_current_timestamp_change,
        on_current_frame_change=on_current_frame_change
    )

    return component_value
