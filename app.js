/* ==========================================================================
   JavaScript Application Logic: AI Business Card Scanner (L.名刺読み取りアプリ_端末制限版)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // ---------------------------------------------------------
    // 1. Config & State Variables
    // ---------------------------------------------------------
    const GEMINI_MODEL = 'gemini-2.5-flash'; 
    const CORRECT_PASSCODE = 'MOBILE-ACCESS-2026'; // 管理者から提供される端末解除アクセスコード
    
    let selectedFileBase64 = null;
    let selectedFileMime = null;

    // DOM Elements
    const elements = {
        // Device Restrictions Screen
        pcLockOverlay: document.getElementById('pc-lock-overlay'),
        passcodeLockOverlay: document.getElementById('passcode-lock-overlay'),
        passcodeField: document.getElementById('passcode-field'),
        btnPasscodeUnlock: document.getElementById('btn-passcode-unlock'),
        passcodeError: document.getElementById('passcode-error'),
        deviceUuidDisplay: document.getElementById('device-uuid-display'),
        btnCopyDeviceUuid: document.getElementById('btn-copy-device-uuid'),
        
        // Settings Device Info
        settingsUuidDisplay: document.getElementById('settings-uuid-display'),
        btnSettingsCopyUuid: document.getElementById('btn-settings-copy-uuid'),
        btnDeviceLockReset: document.getElementById('btn-device-lock-reset'),

        // API Status
        apiStatusBanner: document.getElementById('api-status-banner'),
        
        // Upload & Image Preview
        dropZone: document.getElementById('drop-zone'),
        cameraFileInput: document.getElementById('camera-file-input'),
        btnFileSelect: document.getElementById('btn-file-select'),
        fileSelectContainer: document.getElementById('file-select-container'),
        imageFileInput: document.getElementById('image-file-input'),
        previewContainer: document.getElementById('preview-container'),
        previewImage: document.getElementById('preview-image'),
        btnClearPreview: document.getElementById('btn-clear-preview'),
        
        // Action & Loading
        btnProcess: document.getElementById('btn-process'),
        loadingOverlay: document.getElementById('loading-overlay'),
        loadingText: document.getElementById('loading-text'),
        
        // Output Result
        resultSection: document.getElementById('result-section'),
        resultBox: document.getElementById('result-box'),
        btnCopy: document.getElementById('btn-copy'),
        
        // Settings Modal
        btnSettingsToggle: document.getElementById('btn-settings-toggle'),
        settingsModal: document.getElementById('settings-modal'),
        btnSettingsClose: document.getElementById('btn-settings-close'),
        geminiApiKey: document.getElementById('gemini-api-key'),
        btnSettingsSave: document.getElementById('btn-settings-save'),
        toggleVisibilityBtns: document.querySelectorAll('.btn-toggle-visibility')
    };

    // ---------------------------------------------------------
    // 2. Helper Functions
    // ---------------------------------------------------------
    function safeCreateIcons() {
        try {
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons();
            }
        } catch (e) {
            console.warn("Lucideアイコンの描画に失敗しました:", e);
        }
    }

    function showLoading(show) {
        if (!elements.loadingOverlay) return;
        if (show) {
            elements.loadingOverlay.style.display = 'flex';
            elements.btnProcess.disabled = true;
        } else {
            elements.loadingOverlay.style.display = 'none';
            elements.btnProcess.disabled = false;
        }
    }

    // ---------------------------------------------------------
    // 3. Device Identification & Access Restriction
    // ---------------------------------------------------------
    
    // Check if the current device is a mobile device (Smartphones/Tablets)
    function isMobileDevice() {
        // Debug override for testing
        if (localStorage.getItem('ignore_mobile_check') === 'true') {
            return true;
        }
        
        const ua = navigator.userAgent.toLowerCase();
        const isMobileUA = /mobile|iphone|ipad|ipod|android|blackberry|iemobile|opera mini|silk/i.test(ua);
        const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        // Screen width check is a secondary heuristic for small touchscreens (smartphones)
        const isSmallScreen = window.screen.width < 1024;
        
        return isMobileUA || (hasTouch && isSmallScreen);
    }

    // Generate or fetch the device UUID (to track registered devices)
    function getOrCreateDeviceUUID() {
        let uuid = localStorage.getItem('device_uuid');
        if (!uuid) {
            try {
                if (window.crypto && typeof window.crypto.randomUUID === 'function') {
                    uuid = 'dev-' + crypto.randomUUID();
                } else {
                    // Fallback UUID generation
                    uuid = 'dev-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now().toString(36);
                }
                localStorage.setItem('device_uuid', uuid);
            } catch (e) {
                uuid = 'dev-unknown-' + Date.now();
            }
        }
        return uuid;
    }

    // 許可された端末のUUIDリスト（管理者用ホワイトリスト）
    // 社員のスマートフォンを追加する場合は、以下の配列の中にUUIDを文字列として追加してください。
    const ALLOWED_DEVICES = [
        'dev-test-pc-bypass', // デバッグ・開発用のサンプルID
        'dev-12866a9b-4004-470c-be51-0c5a6be81538', // 登録済: Android (Pixel 7a)
        // ここに許可する端末のUUID（dev-xxxx...）を追記していきます。
        // 例: 'dev-12345678-abcd-ef01-2345-6789abcdef01',
    ];

    // Check device status and handle lock overlay displays
    function enforceDeviceRestrictions() {
        // Step 1: Enforce Mobile-only restriction
        if (!isMobileDevice()) {
            if (elements.pcLockOverlay) {
                elements.pcLockOverlay.classList.remove('hidden');
            }
            
            // 開発者向けにコンソールに回避方法とallow pastingの案内を出力
            console.log(
                "%c【開発者用デバッグガイド】\n" +
                "PCでこのアプリをテスト・確認したい場合は、コンソールで以下を実行してください：\n\n" +
                "※コピペが制限されている場合は、先に「allow pasting」とコンソールに入力して Enter を押してください。\n\n" +
                "実行コマンド:\n" +
                "localStorage.ignore_mobile_check = 'true'; location.reload();",
                "color: #3b82f6; font-weight: bold; font-size: 1.15em; line-height: 1.5;"
            );
            
            // Block anything else from running
            return false;
        } else {
            if (elements.pcLockOverlay) {
                elements.pcLockOverlay.classList.add('hidden');
            }
        }

        const uuid = getOrCreateDeviceUUID();

        // Step 2: Enforce whitelist check (Authorized Device List)
        // PCデバッグ時（ignore_mobile_checkがtrue）はホワイトリストチェックをバイパスします
        const isAllowedDevice = ALLOWED_DEVICES.includes(uuid) || localStorage.getItem('ignore_mobile_check') === 'true';
        
        if (!isAllowedDevice) {
            // 未登録デバイス用のロック表示
            if (elements.deviceUuidDisplay) {
                elements.deviceUuidDisplay.textContent = uuid;
            }
            if (elements.passcodeError) {
                elements.passcodeError.innerHTML = 'この端末IDは管理者によって登録されていません。<br>上記の識別IDを管理者に報告して登録を依頼してください。';
                elements.passcodeError.style.color = 'var(--danger)';
            }
            if (elements.passcodeField) {
                elements.passcodeField.disabled = true;
                elements.passcodeField.placeholder = "登録待ち（入力不可）";
                elements.passcodeField.value = "";
            }
            if (elements.btnPasscodeUnlock) {
                elements.btnPasscodeUnlock.disabled = true;
            }
            if (elements.passcodeLockOverlay) {
                elements.passcodeLockOverlay.classList.remove('hidden');
            }
            return false;
        } else {
            // 登録済みの場合は、パスコード入力欄を活性化
            if (elements.passcodeField) {
                elements.passcodeField.disabled = false;
                elements.passcodeField.placeholder = "••••••••";
            }
            if (elements.btnPasscodeUnlock) {
                elements.btnPasscodeUnlock.disabled = false;
            }
        }

        // Step 3: Enforce passcode check (Authorized Device)
        const isAuthorized = localStorage.getItem('device_authorized') === 'true';
        if (!isAuthorized) {
            if (elements.deviceUuidDisplay) {
                elements.deviceUuidDisplay.textContent = uuid;
            }
            if (elements.passcodeError) {
                elements.passcodeError.textContent = ''; // エラー表示をクリア
            }
            if (elements.passcodeLockOverlay) {
                elements.passcodeLockOverlay.classList.remove('hidden');
            }
            return false;
        } else {
            if (elements.passcodeLockOverlay) {
                elements.passcodeLockOverlay.classList.add('hidden');
            }
        }

        // Populate device information in settings menu
        if (elements.settingsUuidDisplay) {
            elements.settingsUuidDisplay.textContent = uuid;
        }

        return true;
    }

    // Handle Passcode Unlock Event
    if (elements.btnPasscodeUnlock && elements.passcodeField) {
        const attemptUnlock = () => {
            const enteredVal = elements.passcodeField.value.trim();
            if (enteredVal === CORRECT_PASSCODE) {
                localStorage.setItem('device_authorized', 'true');
                if (elements.passcodeError) elements.passcodeError.textContent = '';
                if (elements.passcodeLockOverlay) elements.passcodeLockOverlay.classList.add('hidden');
                
                // Initialize UUID details in settings
                const uuid = getOrCreateDeviceUUID();
                if (elements.settingsUuidDisplay) {
                    elements.settingsUuidDisplay.textContent = uuid;
                }
                
                // Reset inputs and display alert
                alert('端末アクセスが承認されました。メイン画面を開きます。');
                enforceDeviceRestrictions();
            } else {
                if (elements.passcodeError) {
                    elements.passcodeError.textContent = 'アクセスコードが正しくありません。';
                }
                elements.passcodeField.classList.add('error');
                setTimeout(() => {
                    elements.passcodeField.classList.remove('error');
                }, 500);
            }
        };

        elements.btnPasscodeUnlock.addEventListener('click', attemptUnlock);
        
        // Enter key inside passcode field
        elements.passcodeField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                attemptUnlock();
            }
        });
    }

    // Copy UUID events
    const setupCopyUuidBtn = (btn, textSourceId) => {
        if (btn) {
            btn.addEventListener('click', () => {
                const textElem = document.getElementById(textSourceId);
                if (!textElem) return;
                const uuidText = textElem.textContent;

                navigator.clipboard.writeText(uuidText)
                    .then(() => {
                        const originalHTML = btn.innerHTML;
                        btn.innerHTML = '<i data-lucide="check" style="width: 14px; height: 14px;"></i>';
                        safeCreateIcons();
                        setTimeout(() => {
                            btn.innerHTML = originalHTML;
                            safeCreateIcons();
                        }, 2000);
                    })
                    .catch(err => {
                        console.error('UUIDコピー失敗:', err);
                        alert('コピーに失敗しました。');
                    });
            });
        }
    };
    setupCopyUuidBtn(elements.btnCopyDeviceUuid, 'device-uuid-display');
    setupCopyUuidBtn(elements.btnSettingsCopyUuid, 'settings-uuid-display');

    // Re-lock Device button
    if (elements.btnDeviceLockReset) {
        elements.btnDeviceLockReset.addEventListener('click', () => {
            if (confirm('この端末を再ロックしますか？次回起動時に再びアクセスコードの入力が必要になります。')) {
                localStorage.removeItem('device_authorized');
                window.location.reload();
            }
        });
    }

    // ---------------------------------------------------------
    // 4. API Key Management (LocalStorage)
    // ---------------------------------------------------------
    function getApiKey() {
        return localStorage.getItem('gemini_api_key') || '';
    }

    function checkApiKeyConfigured() {
        const key = getApiKey();
        const isConfigured = key.trim() !== '';
        
        if (elements.apiStatusBanner) {
            if (isConfigured) {
                elements.apiStatusBanner.classList.add('hidden');
            } else {
                elements.apiStatusBanner.classList.remove('hidden');
            }
        }
    }

    function loadSavedKeys() {
        if (elements.geminiApiKey) {
            elements.geminiApiKey.value = getApiKey();
        }
        checkApiKeyConfigured();
    }

    // Toggle API Key password visibility
    if (elements.toggleVisibilityBtns) {
        elements.toggleVisibilityBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-target');
                const targetInput = document.getElementById(targetId);
                if (targetInput) {
                    const icon = btn.querySelector('i');
                    if (targetInput.type === 'password') {
                        targetInput.type = 'text';
                        if (icon) icon.setAttribute('data-lucide', 'eye-off');
                    } else {
                        targetInput.type = 'password';
                        if (icon) icon.setAttribute('data-lucide', 'eye');
                    }
                    safeCreateIcons();
                }
            });
        });
    }

    // Settings Modal Actions
    if (elements.btnSettingsToggle) {
        elements.btnSettingsToggle.addEventListener('click', () => {
            loadSavedKeys();
            if (elements.settingsModal) elements.settingsModal.classList.remove('hidden');
        });
    }

    if (elements.btnSettingsClose) {
        elements.btnSettingsClose.addEventListener('click', () => {
            if (elements.settingsModal) elements.settingsModal.classList.add('hidden');
        });
    }

    if (elements.btnSettingsSave) {
        elements.btnSettingsSave.addEventListener('click', () => {
            if (elements.geminiApiKey) {
                localStorage.setItem('gemini_api_key', elements.geminiApiKey.value.trim());
            }
            checkApiKeyConfigured();
            if (elements.settingsModal) elements.settingsModal.classList.add('hidden');
        });
    }

    // Click warning banner to open settings modal
    if (elements.apiStatusBanner) {
        elements.apiStatusBanner.addEventListener('click', () => {
            if (elements.btnSettingsToggle) elements.btnSettingsToggle.click();
        });
    }

    // ---------------------------------------------------------
    // 5. File Upload (Drag & Drop / Select)
    // ---------------------------------------------------------
    if (elements.dropZone) {
        const preventDefaults = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            elements.dropZone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            elements.dropZone.addEventListener(eventName, () => elements.dropZone.classList.add('dragover'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            elements.dropZone.addEventListener(eventName, () => elements.dropZone.classList.remove('dragover'), false);
        });

        elements.dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                handleSelectedFile(files[0]);
            }
        });

        // Click triggers camera input
        elements.dropZone.addEventListener('click', () => {
            if (elements.cameraFileInput) elements.cameraFileInput.click();
        });
    }

    // Camera input change event
    if (elements.cameraFileInput) {
        elements.cameraFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleSelectedFile(e.target.files[0]);
            }
        });
    }

    // Button to select file manually
    if (elements.btnFileSelect) {
        elements.btnFileSelect.addEventListener('click', () => {
            if (elements.imageFileInput) elements.imageFileInput.click();
        });
    }

    // Normal file input change event
    if (elements.imageFileInput) {
        elements.imageFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleSelectedFile(e.target.files[0]);
            }
        });
    }

    function handleSelectedFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('画像ファイル（PNG, JPEGなど）を選択してください。');
            return;
        }

        // プレビュー表示
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            if (elements.previewImage) elements.previewImage.src = reader.result;
            if (elements.previewContainer) elements.previewContainer.style.display = 'block';
            if (elements.dropZone) elements.dropZone.style.display = 'none';
            if (elements.fileSelectContainer) elements.fileSelectContainer.style.display = 'none';
            if (elements.btnProcess) elements.btnProcess.disabled = false;
            
            // Base64にエンコード
            selectedFileBase64 = reader.result.split(',')[1];
            selectedFileMime = file.type;
        };
    }

    if (elements.btnClearPreview) {
        elements.btnClearPreview.addEventListener('click', (e) => {
            e.stopPropagation();
            selectedFileBase64 = null;
            selectedFileMime = null;
            if (elements.cameraFileInput) elements.cameraFileInput.value = '';
            if (elements.imageFileInput) elements.imageFileInput.value = '';
            if (elements.previewContainer) elements.previewContainer.style.display = 'none';
            if (elements.dropZone) elements.dropZone.style.display = 'flex';
            if (elements.fileSelectContainer) elements.fileSelectContainer.style.display = 'flex';
            if (elements.btnProcess) elements.btnProcess.disabled = true;
            if (elements.resultSection) elements.resultSection.style.display = 'none';
        });
    }

    // ---------------------------------------------------------
    // 6. OCR & AI Analysis (Gemini Integration)
    // ---------------------------------------------------------
    if (elements.btnProcess) {
        elements.btnProcess.addEventListener('click', async () => {
            try {
                // Ensure device is still authorized
                if (!localStorage.getItem('device_authorized') === 'true') {
                    alert('端末のセキュリティ認証が切れています。再読み込みを行ってください。');
                    window.location.reload();
                    return;
                }

                const key = getApiKey();
                if (!key.trim()) {
                    alert('Gemini APIキーを設定してください。画面右上の設定アイコンから登録できます。');
                    if (elements.btnSettingsToggle) elements.btnSettingsToggle.click();
                    return;
                }

                if (!selectedFileBase64) {
                    alert('名刺の画像を選択してください。');
                    return;
                }

                showLoading(true);

                // 名刺の解析指示プロンプト
                const prompt = `あなたは優秀なビジネスアシスタントです。添付された名刺画像を注意深く読み取って、記載されている情報を正確にデータ化してください。
以下項目を読み取り、誤変換や文字化け、1とlの誤認などがあれば文脈から自己修正して、整理された綺麗なテキスト形式で出力してください。名刺内に該当する記載がない場合は、省略するのではなく「項目（記載なし）」と出力してください。

【出力する項目】
■ 会社名
■ 部署
■ 役職
■ 氏名
※ふりがなは一切出力しないでください。名刺にふりがなが書かれていても除外し、漢字やアルファベットの氏名のみを出力してください。
■ 電話番号
※固定電話、携帯電話、FAXなどがあれば全て記載してください。
■ メールアドレス
■ 郵便番号・住所
※郵便番号（123-4567等）も含めて記載してください。
■ ウェブサイトURL
■ その他（備考）
※ロゴマークの文字、キャッチコピー、英語表記など、上記に含まれない記載項目があれば記載してください。

---
【出力フォーマット】
余計な前置き（「解析しました」など）や挨拶文、マークダウンコードブロック記号（\`\`\`など）は一切出力しないでください。上記の「【出力する項目】」の内容だけを、直接テキストとして出力してください。`;

                const payload = {
                    contents: [{
                        parts: [
                            {
                                inlineData: {
                                    mimeType: selectedFileMime,
                                    data: selectedFileBase64
                                }
                            },
                            {
                                text: prompt
                            }
                        ]
                    }]
                };

                const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
                
                const response = await fetch(apiEndpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    const apiErrorMessage = errData.error?.message || `HTTP status: ${response.status}`;
                    throw new Error(`Gemini APIエラー: ${apiErrorMessage}`);
                }

                const data = await response.json();
                let resultText = "";
                try {
                    resultText = data.candidates[0].content.parts[0].text.trim();
                } catch (e) {
                    throw new Error("解析結果の読み込みに失敗しました。APIの応答が想定外です。");
                }

                // 結果の表示
                if (elements.resultBox) elements.resultBox.value = resultText;
                if (elements.resultSection) elements.resultSection.style.display = 'block';
                
                // 解析成功時に結果エリアまでスムーズスクロール
                elements.resultSection.scrollIntoView({ behavior: 'smooth' });

            } catch (error) {
                console.error("解析エラー:", error);
                alert(`名刺の解析中にエラーが発生しました:\n${error.message}`);
            } finally {
                showLoading(false);
            }
        });
    }

    // ---------------------------------------------------------
    // 7. Copy to Clipboard
    // ---------------------------------------------------------
    if (elements.btnCopy) {
        elements.btnCopy.addEventListener('click', () => {
            if (!elements.resultBox) return;
            const textToCopy = elements.resultBox.value;
            
            navigator.clipboard.writeText(textToCopy)
                .then(() => {
                    const originalHTML = elements.btnCopy.innerHTML;
                    elements.btnCopy.innerHTML = '<i data-lucide="check" style="width: 14px; height: 14px;"></i> コピーしました';
                    safeCreateIcons();
                    setTimeout(() => {
                        elements.btnCopy.innerHTML = originalHTML;
                        safeCreateIcons();
                    }, 2000);
                })
                .catch(err => {
                    console.error("コピー失敗:", err);
                    alert("コピーに失敗しました。");
                });
        });
    }

    // ---------------------------------------------------------
    // 8. Initialization & Enforcement
    // ---------------------------------------------------------
    try {
        // Enforce restrictions first. If it passes, initialize keys and icons.
        const isPassed = enforceDeviceRestrictions();
        
        // Load API Keys
        loadSavedKeys();
        safeCreateIcons();
        
        console.log("Device pass check status: " + isPassed);
    } catch (initError) {
        console.error("初期化エラー:", initError);
    }
});
