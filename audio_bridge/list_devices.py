import pyaudiowpatch as pa
p = pa.PyAudio()
print('All loopback devices:')
for i in range(p.get_device_count()):
    info = p.get_device_info_by_index(i)
    if info.get('isLoopbackDevice'):
        print(i, info['name'], info['defaultSampleRate'], info['maxInputChannels'])
p.terminate()
