<script setup lang="ts">
import type { HermesModel } from '~/types/hermes'

const props = withDefaults(defineProps<{
  modelValue: boolean
  models?: HermesModel[]
  loading?: boolean
  initialModel?: string
}>(), {
  models: () => [],
  loading: false,
  initialModel: ''
})

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  confirm: [modelId: string]
  cancel: []
}>()

const selectedId = ref(props.initialModel)

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      selectedId.value = props.initialModel
      document.addEventListener('keydown', onKey)
    } else {
      document.removeEventListener('keydown', onKey)
    }
  }
)

onBeforeUnmount(() => document.removeEventListener('keydown', onKey))

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') cancel()
}

function close() {
  emit('update:modelValue', false)
}

function confirm() {
  emit('confirm', selectedId.value)
  close()
}

function cancel() {
  emit('cancel')
  close()
}

function selectModel(id: string) {
  selectedId.value = id
}
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <Transition name="modal">
      <div v-if="modelValue" class="modal" role="dialog" aria-modal="true" @click.self="cancel">
        <div class="modal__panel glass glass--strong anim-scale-in">
          <h3 class="modal__title">选择模型</h3>
          <p class="modal__message">为当前会话选择 AI 模型</p>

          <!-- Loading state -->
          <div v-if="loading" class="modal__loading">
            <div class="spinner">
              <span class="spinner__dot"></span>
              <span class="spinner__dot"></span>
              <span class="spinner__dot"></span>
            </div>
            <p>加载模型列表中…</p>
          </div>

          <!-- Model list -->
          <div v-else class="modal__list" role="radiogroup" aria-label="可用模型">
            <button
              v-for="model in models"
              :key="model.id"
              class="model-option glass glass--subtle"
              :class="{ 'model-option--selected': model.id === selectedId }"
              :aria-pressed="model.id === selectedId"
              @click="selectModel(model.id)"
            >
              <span class="model-option__radio">
                <span v-if="model.id === selectedId" class="model-option__dot"></span>
              </span>
              <div class="model-option__content">
                <span class="model-option__id">{{ model.id }}</span>
                <span v-if="model.owned_by" class="model-option__meta">{{ model.owned_by }}</span>
              </div>
            </button>
          </div>

          <div v-if="!loading" class="modal__actions">
            <button class="glass-btn" @click="cancel">取消</button>
            <button class="glass-btn glass-btn--primary" :disabled="!selectedId" @click="confirm">
              确认
            </button>
          </div>
        </div>
      </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: var(--space-4);
  background: oklch(10% 0.02 var(--hue-violet) / 0.35);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.modal__panel {
  width: min(480px, 100%);
  max-height: 80vh;
  padding: var(--space-5);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  overflow: hidden;
}

.modal__title {
  font-size: var(--text-lg);
  font-weight: 700;
}

.modal__message {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.5;
}

.modal__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-6);
  color: var(--text-secondary);
}

.spinner {
  display: flex;
  gap: var(--space-1);
}

.spinner__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-primary);
  animation: blink 1.4s infinite ease-in-out both;
}

.spinner__dot:nth-child(1) { animation-delay: -0.32s; }
.spinner__dot:nth-child(2) { animation-delay: -0.16s; }
.spinner__dot:nth-child(3) { animation-delay: 0; }

@keyframes blink {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

.modal__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-height: 400px;
  overflow-y: auto;
  padding: var(--space-1);
}

.model-option {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  text-align: left;
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out-expo);
  border: 1px solid transparent;
}

.model-option:hover {
  background: var(--glass-fill-hover);
}

.model-option--selected {
  border-color: var(--accent-primary);
  background: oklch(90% 0.06 var(--hue-violet) / 0.5);
}

.model-option__radio {
  flex: none;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color);
  border-radius: 50%;
  transition: all var(--dur-fast) var(--ease-out-expo);
}

.model-option--selected .model-option__radio {
  border-color: var(--accent-primary);
  background: oklch(95% 0.06 var(--hue-violet) / 0.8);
}

.model-option__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent-primary);
  animation: scaleIn 0.2s var(--ease-out-expo);
}

@keyframes scaleIn {
  from { transform: scale(0); }
  to { transform: scale(1); }
}

.model-option__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.model-option__id {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-primary);
}

.model-option__meta {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--dur-normal) var(--ease-out-expo);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
