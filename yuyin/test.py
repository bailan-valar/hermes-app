from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess

model = AutoModel(model="iic/SenseVoiceSmall", vad_model="fsmn-vad", spk_model="cam++", device="cuda")
result = model.generate(input="https://isv-data.oss-cn-hangzhou.aliyuncs.com/ics/MaaS/ASR/test_audio/asr_example_zh.wav")

# 一次调用即返回带说话人 id 和时间戳的 VAD 分段，可自由渲染：
for seg in result[0]["sentence_info"]:
    print(f"[{seg['start']/1000:.1f}s] 说话人{seg['spk']}: {rich_transcription_postprocess(seg['sentence'])}")