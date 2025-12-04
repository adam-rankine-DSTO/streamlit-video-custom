import streamlit as st
from testcomponent import testcomponent

st.subheader("Current time and skip to video component")
st.session_state.seek_ts = 0

st.session_state.seek_ts = st.text_input("Seek to: ", value=st.session_state.seek_ts)

# result = testcomponent(seek_to=st.session_state.seek_ts, src="http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4")
result = testcomponent(seek_to=st.session_state.seek_ts, src="https://someurl.com/video")

st.markdown(f"Current timestamp: {result["current_timestamp"]}")
