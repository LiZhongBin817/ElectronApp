<!-- 登录页面：支持企业 OAuth，以及按数据源配置启用的本地兜底登录。 -->
<script setup lang="ts">
import { Connection, Hide, Link, Lock, Monitor, User, View } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { clearToken, getDataSourceInstances, getDataSourcePlatforms, getLoginConfig, login, oauthStartUrl } from '../api';
import LoginMascot from '../components/LoginMascot.vue';
import type { DataSourceInstance, DataSourcePlatform, PlatformKey } from '../types';

type LoginMode = 'oauth' | 'local';
type FocusedField = 'platform' | 'username' | 'password' | null;
const rememberPrefix = 'tms-remember-login:';

const router = useRouter();
const route = useRoute();
const loading = ref(false);
const loadingSources = ref(false);
const platforms = ref<DataSourcePlatform[]>([]);
const instances = ref<DataSourceInstance[]>([]);
const oauthProviders = ref<PlatformKey[]>([]);
const localLoginEnabled = ref(false);
const loginMode = ref<LoginMode>('local');
const rememberPassword = ref(false);
const focusedField = ref<FocusedField>(null);
const passwordVisible = ref(false);
const loginError = ref('');
const apiConfig = ref<ApiRuntimeConfig>({ mode: 'local', remoteBaseUrl: '', activeBaseUrl: '' });
const apiConfigVisible = ref(false);
const apiConfigSaving = ref(false);
const remoteApiInput = ref('');
const form = reactive({
  username: '',
  password: '',
  platform: 'dingtalk' as PlatformKey
});

const activeInstance = computed(() => instances.value.find((item) => item.enabled));
const hasDataSource = computed(() => Boolean(activeInstance.value));
const currentProviderLabel = computed(() => (form.platform === 'feishu' ? '飞书登录' : '钉钉登录'));
const passwordLength = computed(() => form.password.length);
const oauthEnabled = computed(() => oauthProviders.value.includes(form.platform));
const loginFeatureLabel = computed(() => (oauthProviders.value.length ? '企业登录' : '本地登录'));
const apiModeText = computed(() => (apiConfig.value.mode === 'remote' ? '共享后端' : '本机数据'));
const apiModeDetail = computed(() => apiConfig.value.activeBaseUrl || '等待初始化');
const loginModeOptions = computed(() => {
  const options: Array<{ label: string; value: LoginMode }> = [];
  if (oauthEnabled.value) options.push({ label: currentProviderLabel.value, value: 'oauth' });
  if (localLoginEnabled.value) options.push({ label: '账号密码登录', value: 'local' });
  return options;
});

function rememberedKey(platform: PlatformKey) {
  return `${rememberPrefix}${platform}`;
}

function applyRememberedCredentials(platform = form.platform) {
  try {
    const saved = JSON.parse(localStorage.getItem(rememberedKey(platform)) || '{}');
    if (saved?.username && saved?.password) {
      form.username = saved.username;
      form.password = saved.password;
      rememberPassword.value = true;
      return;
    }
  } catch {
    localStorage.removeItem(rememberedKey(platform));
  }
  rememberPassword.value = false;
}

function preferredLoginMode() {
  if (localLoginEnabled.value) return 'local';
  if (oauthEnabled.value) return 'oauth';
  return 'local';
}

function persistRememberedCredentials() {
  const key = rememberedKey(form.platform);
  if (rememberPassword.value) {
    localStorage.setItem(key, JSON.stringify({
      username: form.username,
      password: form.password
    }));
  } else {
    localStorage.removeItem(key);
  }
}

async function loadPlatforms() {
  platforms.value = await getDataSourcePlatforms();
}

async function loadApiRuntimeConfig() {
  if (!window.$api?.getApiRuntimeConfig) return;
  apiConfig.value = await window.$api.getApiRuntimeConfig();
  remoteApiInput.value = apiConfig.value.remoteBaseUrl;
}

async function reloadLoginData() {
  const config = await getLoginConfig();
  oauthProviders.value = config.providers.map((item) => item.key);
  localLoginEnabled.value = config.localLoginEnabled;
  loginMode.value = preferredLoginMode();
  await loadPlatforms();
  await loadInstances();
}

async function loadInstances() {
  loadingSources.value = true;
  loginError.value = '';
  try {
    instances.value = await getDataSourceInstances(form.platform);
    loginMode.value = preferredLoginMode();
  } catch (error: any) {
    loginError.value = error.response?.data?.message || '数据源实例加载失败';
    ElMessage.error(loginError.value);
  } finally {
    loadingSources.value = false;
  }
}

function startOAuthLogin() {
  if (!oauthEnabled.value) {
    loginError.value = '当前平台未配置企业登录，请使用账号密码登录或到系统配置中填写 OAuth 参数';
    ElMessage.warning(loginError.value);
    loginMode.value = localLoginEnabled.value ? 'local' : 'oauth';
    return;
  }
  if (!hasDataSource.value) {
    loginError.value = '当前平台未配置可用数据源，请先到系统配置中绑定';
    ElMessage.warning(loginError.value);
    return;
  }
  loginError.value = '';
  clearToken();
  location.href = oauthStartUrl(form.platform, activeInstance.value?.id);
}

async function submitLocalLogin() {
  if (!hasDataSource.value) {
    loginError.value = '当前平台未配置可用数据源，请先到系统配置中绑定';
    ElMessage.warning(loginError.value);
    return;
  }
  if (!localLoginEnabled.value) {
    loginError.value = '当前平台未授权账号密码登录';
    ElMessage.warning(loginError.value);
    return;
  }
  if (!form.username.trim() || !form.password) {
    loginError.value = '请输入登录账号和密码';
    ElMessage.warning(loginError.value);
    return;
  }
  loading.value = true;
  loginError.value = '';
  try {
    await login(form.username, form.password, form.platform);
    persistRememberedCredentials();
    ElMessage.success('登录成功');
    router.push('/dashboard');
  } catch (error: any) {
    loginError.value = error.response?.data?.message || '登录失败';
    ElMessage.error(loginError.value);
  } finally {
    loading.value = false;
  }
}

function submitLogin() {
  if (loginMode.value === 'local') {
    submitLocalLogin();
    return;
  }
  startOAuthLogin();
}

watch(() => form.platform, async (platform) => {
  loginError.value = '';
  applyRememberedCredentials(platform);
  await loadInstances();
});
watch(loginMode, () => {
  if (loginMode.value === 'oauth' && !oauthEnabled.value) {
    loginMode.value = preferredLoginMode();
    return;
  }
  loginError.value = '';
  focusedField.value = null;
});
watch(oauthEnabled, () => {
  if (!oauthEnabled.value && loginMode.value === 'oauth') {
    loginMode.value = preferredLoginMode();
  }
});
onMounted(async () => {
  const oauthError = String(route.query.oauthError || '');
  if (oauthError) {
    loginError.value = oauthError;
    ElMessage.error(oauthError);
  }
  try {
    await loadApiRuntimeConfig();
    applyRememberedCredentials();
    await reloadLoginData();
  } catch {
    platforms.value = [
      { key: 'dingtalk', label: '钉钉' },
      { key: 'feishu', label: '飞书' }
    ];
    loginError.value = '登录配置加载失败，已使用默认平台选项';
  }
});

function openApiConfig() {
  remoteApiInput.value = apiConfig.value.remoteBaseUrl || apiConfig.value.activeBaseUrl;
  apiConfigVisible.value = true;
}

async function saveRemoteApiConfig() {
  if (!remoteApiInput.value.trim()) {
    ElMessage.warning('请输入 PC 端后端地址');
    return;
  }
  apiConfigSaving.value = true;
  loginError.value = '';
  try {
    apiConfig.value = await window.$api.setRemoteApiBaseUrl(remoteApiInput.value);
    clearToken();
    await reloadLoginData();
    apiConfigVisible.value = false;
    ElMessage.success('已切换到共享后端');
  } catch (error: any) {
    ElMessage.error(error.message || '共享后端设置失败');
  } finally {
    apiConfigSaving.value = false;
  }
}

async function useLocalApiConfig() {
  apiConfigSaving.value = true;
  loginError.value = '';
  try {
    apiConfig.value = await window.$api.useLocalApiBaseUrl();
    clearToken();
    await reloadLoginData();
    apiConfigVisible.value = false;
    ElMessage.success('已切回本机数据');
  } catch (error: any) {
    ElMessage.error(error.message || '切回本机数据失败');
  } finally {
    apiConfigSaving.value = false;
  }
}
</script>

<template>
  <main class="login-page">
    <div class="login-backdrop" aria-hidden="true">
      <div class="login-grid"></div>
      <div class="login-scanline"></div>
    </div>

    <section class="login-shell">
      <div class="login-showcase">
        <div class="login-mark">TMS</div>
        <p class="eyebrow">任务协同平台</p>
        <h1>任务管理系统</h1>
        <p class="login-subtitle">聚合项目、人员、待办与企业表格同步，一处入口掌控交付节奏。</p>
        <LoginMascot
          :login-mode="loginMode"
          :focused-field="focusedField"
          :password-visible="passwordVisible"
          :password-length="passwordLength"
          :loading="loading || loadingSources"
          :error-message="loginError"
        />
        <div class="login-metrics" aria-hidden="true">
          <span>项目流转</span>
          <strong>实时同步</strong>
          <span>{{ loginFeatureLabel }}</span>
        </div>
      </div>

      <el-form class="login-panel login-form" @submit.prevent="submitLogin">
        <div class="login-panel-header">
          <div class="login-panel-title">
            <span>安全访问</span>
            <strong>{{ loginMode === 'local' ? '账号登录' : currentProviderLabel }}</strong>
          </div>
          <el-button class="api-config-trigger" text :icon="Link" @click="openApiConfig">后端设置</el-button>
        </div>

        <el-form-item>
          <el-select
            v-model="form.platform"
            size="large"
            class="full-field"
            placeholder="企业平台"
            :prefix-icon="Connection"
            @focus="focusedField = 'platform'"
            @blur="focusedField = null"
          >
            <el-option v-for="item in platforms" :key="item.key" :label="item.label" :value="item.key" />
          </el-select>
        </el-form-item>

        <el-segmented
          v-if="oauthEnabled && loginModeOptions.length > 1"
          v-model="loginMode"
          class="login-mode-switch"
          :options="loginModeOptions"
        />

        <template v-if="loginMode === 'local'">
          <el-form-item>
            <el-input
              v-model="form.username"
              size="large"
              placeholder="登录账号"
              :prefix-icon="User"
              @focus="focusedField = 'username'"
              @blur="focusedField = null"
              @input="loginError = ''"
              @keyup.enter="submitLocalLogin"
            />
          </el-form-item>
          <el-form-item>
            <el-input
              v-model="form.password"
              size="large"
              placeholder="密码"
              :type="passwordVisible ? 'text' : 'password'"
              :prefix-icon="Lock"
              @focus="focusedField = 'password'"
              @blur="focusedField = null"
              @input="loginError = ''"
              @keyup.enter="submitLocalLogin"
            >
              <template #suffix>
                <el-button
                  class="password-toggle"
                  text
                  :icon="passwordVisible ? View : Hide"
                  :aria-label="passwordVisible ? '隐藏密码' : '显示密码'"
                  @mousedown.prevent
                  @click="passwordVisible = !passwordVisible"
                />
              </template>
            </el-input>
          </el-form-item>
          <div class="login-options">
            <el-checkbox v-model="rememberPassword">记住密码</el-checkbox>
            <span>仅保存在当前浏览器</span>
          </div>
        </template>

        <div v-if="loginError" class="login-error" role="alert">{{ loginError }}</div>

        <el-button class="full-button" size="large" type="primary" native-type="submit" :loading="loading || loadingSources" @click="submitLogin">
          {{ loginMode === 'local' ? '账号密码登录' : currentProviderLabel }}
        </el-button>

        <div class="api-mode-bar">
          <div>
            <span>{{ apiModeText }}</span>
            <strong>{{ apiModeDetail }}</strong>
          </div>
        </div>
      </el-form>
    </section>

    <el-dialog v-model="apiConfigVisible" title="后端设置" width="460px" append-to-body>
      <div class="api-config-dialog">
        <div class="api-config-current">
          <el-icon><Monitor /></el-icon>
          <div>
            <span>当前模式</span>
            <strong>{{ apiModeText }}</strong>
            <small>{{ apiModeDetail }}</small>
          </div>
        </div>
        <el-input
          v-model="remoteApiInput"
          size="large"
          placeholder="例如 http://192.168.1.20:4000/api"
          clearable
          @keyup.enter="saveRemoteApiConfig"
        />
      </div>
      <template #footer>
        <el-button :loading="apiConfigSaving" @click="useLocalApiConfig">使用本机数据</el-button>
        <el-button type="primary" :loading="apiConfigSaving" @click="saveRemoteApiConfig">使用共享后端</el-button>
      </template>
    </el-dialog>
  </main>
</template>
