import streamlit as st

out = st.components.v2.component(
    "testcomponent.testcomponent",
    js="index-*.js",
    html='<div class="react-root"></div>',
)


def on_current_timestamp_change():
    """Callback function for when the number of clicks changes in the frontend."""
    pass


# Create a wrapper function for the component.
#
# This is an optional best practice. We could simply expose the component
# function returned by `st.components.v2.component` and call it done.
#
# The wrapper allows us to customize our component's API: we can pre-process its
# input args, post-process its output value, and add a docstring for users.
def testcomponent(seek_to, src, key=None):
    component_value = out(
        seek_to=seek_to,
        src=src,
        key=key,
        default={"current_timestamp": 0},
        data={"seek_to": seek_to, "src": src},
        on_current_timestamp_change=on_current_timestamp_change,
    )

    # We could modify the value returned from the component if we wanted.
    # There's no need to do this in our simple example - but it's an option.
    return component_value
