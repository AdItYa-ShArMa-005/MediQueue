/**
 * Custom Popup Utility
 * Replace all alert() and confirm() with beautiful custom popups
 */

// ==================== MAIN POPUP FUNCTION ====================

/**
 * Show custom popup
 * @param {Object} options - Popup configuration
 * @param {string} options.title - Popup title
 * @param {string} options.message - Popup message (supports HTML)
 * @param {string} options.type - 'success', 'error', 'warning', 'info', 'confirm'
 * @param {Array} options.buttons - Array of button objects
 * @param {Function} options.onClose - Callback when popup closes
 * @param {boolean} options.autoClose - Auto close popup after timeout
 * @param {number} options.timeout - Timeout in ms for auto close (default 2000)
 */
export function showPopup(options = {}) {
    const {
        title = 'Notification',
        message = '',
        type = 'info',
        buttons = null,
        onClose = null,
        autoClose = false,
        timeout = 2000
    } = options;

    // Remove any existing popups
    removeAllPopups();

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'custom-popup-overlay';
    overlay.id = 'customPopupOverlay';

    // Create popup container
    const popup = document.createElement('div');
    popup.className = `custom-popup popup-${type}`;

    // Get icon based on type
    const icon = getIconForType(type);

    // Create header
    const header = document.createElement('div');
    header.className = 'custom-popup-header';
    header.innerHTML = `
        <h3>${icon} ${title}</h3>
        <button class="custom-popup-close" id="popupCloseBtn">&times;</button>
    `;

    // Create content
    const content = document.createElement('div');
    content.className = 'custom-popup-content';
    content.innerHTML = message;

    // Create footer with buttons
    const footer = document.createElement('div');
    footer.className = 'custom-popup-footer';

    // Default buttons based on type
    let popupButtons = buttons;
    if (!popupButtons) {
        if (type === 'confirm') {
            popupButtons = [
                { text: 'Cancel', style: 'secondary', onClick: () => false },
                { text: 'Confirm', style: 'primary', onClick: () => true }
            ];
        } else {
            popupButtons = [
                { text: 'OK', style: 'primary', onClick: () => true }
            ];
        }
    }

    // Create buttons
    popupButtons.forEach((btn, index) => {
        const button = document.createElement('button');
        button.className = `custom-popup-btn custom-popup-btn-${btn.style || 'primary'}`;
        button.textContent = btn.text;
        button.onclick = () => {
            const result = btn.onClick ? btn.onClick() : true;
            closePopup(result, onClose);
        };
        footer.appendChild(button);
    });

    // Assemble popup
    popup.appendChild(header);
    popup.appendChild(content);
    popup.appendChild(footer);
    overlay.appendChild(popup);

    // Add to document
    document.body.appendChild(overlay);

    // Close button handler
    document.getElementById('popupCloseBtn').onclick = () => {
        closePopup(false, onClose);
    };

    // Click outside to close
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            closePopup(false, onClose);
        }
    };

    // ESC key to close
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closePopup(false, onClose);
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Auto close if enabled
    if (autoClose) {
        setTimeout(() => {
            closePopup(true, onClose);
        }, timeout);
    }

    return new Promise((resolve) => {
        window.popupResolve = resolve;
    });
}

// ==================== HELPER FUNCTIONS ====================

function getIconForType(type) {
    const icons = {
        'success': '✅',
        'error': '❌',
        'warning': '⚠️',
        'info': 'ℹ️',
        'confirm': '❓'
    };
    return icons[type] || 'ℹ️';
}

function closePopup(result, callback) {
    const overlay = document.getElementById('customPopupOverlay');
    if (overlay) {
        overlay.style.animation = 'fadeOut 0.2s ease-in-out';
        setTimeout(() => {
            overlay.remove();
            if (callback) callback(result);
            if (window.popupResolve) {
                window.popupResolve(result);
                window.popupResolve = null;
            }
        }, 200);
    }
}

function removeAllPopups() {
    const existingPopups = document.querySelectorAll('.custom-popup-overlay');
    existingPopups.forEach(popup => popup.remove());
}

// ==================== CONVENIENCE FUNCTIONS ====================

/**
 * Show success popup
 * @param {string} title - Popup title
 * @param {string} message - Popup message
 * @param {Object|Function} optionsOrCallback - Options object or callback function for backward compatibility
 */
export function showSuccess(title, message, optionsOrCallback) {
    // Handle backward compatibility - if third param is function, treat as onClose
    let options = {};
    if (typeof optionsOrCallback === 'function') {
        options.onClose = optionsOrCallback;
    } else if (typeof optionsOrCallback === 'object') {
        options = optionsOrCallback;
    }

    return showPopup({
        title,
        message,
        type: 'success',
        ...options
    });
}

/**
 * Show error popup
 */
export function showError(title, message, optionsOrCallback) {
    let options = {};
    if (typeof optionsOrCallback === 'function') {
        options.onClose = optionsOrCallback;
    } else if (typeof optionsOrCallback === 'object') {
        options = optionsOrCallback;
    }

    return showPopup({
        title,
        message,
        type: 'error',
        ...options
    });
}

/**
 * Show warning popup
 */
export function showWarning(title, message, optionsOrCallback) {
    let options = {};
    if (typeof optionsOrCallback === 'function') {
        options.onClose = optionsOrCallback;
    } else if (typeof optionsOrCallback === 'object') {
        options = optionsOrCallback;
    }

    return showPopup({
        title,
        message,
        type: 'warning',
        ...options
    });
}

/**
 * Show info popup
 */
export function showInfo(title, message, optionsOrCallback) {
    let options = {};
    if (typeof optionsOrCallback === 'function') {
        options.onClose = optionsOrCallback;
    } else if (typeof optionsOrCallback === 'object') {
        options = optionsOrCallback;
    }

    return showPopup({
        title,
        message,
        type: 'info',
        ...options
    });
}

/**
 * Show confirmation dialog
 */
export async function showConfirm(title, message) {
    return showPopup({
        title,
        message,
        type: 'confirm',
        buttons: [
            { text: 'No', style: 'secondary', onClick: () => false },
            { text: 'Yes', style: 'primary', onClick: () => true }
        ]
    });
}

/**
 * Show input dialog
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {string} placeholder - Input placeholder text
 * @returns {Promise<string|null>} - Returns input value or null if cancelled
 */
export async function showInput(title, message, placeholder = '') {
    removeAllPopups();

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'custom-popup-overlay';
    overlay.id = 'customPopupOverlay';

    // Create popup
    const popup = document.createElement('div');
    popup.className = 'custom-popup popup-info';

    // Create header
    const header = document.createElement('div');
    header.className = 'custom-popup-header';
    header.innerHTML = `
        <h3>ℹ️ ${title}</h3>
        <button class="custom-popup-close" id="popupCloseBtn">&times;</button>
    `;

    // Create content with input
    const content = document.createElement('div');
    content.className = 'custom-popup-content';
    content.innerHTML = `
        <p style="margin-bottom: 15px;">${message}</p>
        <input type="text" id="popupInputField" placeholder="${placeholder}" 
               style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 1em;" />
    `;

    // Create footer
    const footer = document.createElement('div');
    footer.className = 'custom-popup-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'custom-popup-btn custom-popup-btn-secondary';
    cancelBtn.textContent = 'Cancel';
    
    const submitBtn = document.createElement('button');
    submitBtn.className = 'custom-popup-btn custom-popup-btn-primary';
    submitBtn.textContent = 'Submit';

    footer.appendChild(cancelBtn);
    footer.appendChild(submitBtn);

    // Assemble
    popup.appendChild(header);
    popup.appendChild(content);
    popup.appendChild(footer);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // Return promise
    return new Promise((resolve) => {
        const inputField = document.getElementById('popupInputField');
        
        // Focus input
        setTimeout(() => inputField.focus(), 100);

        const cleanup = (value) => {
            overlay.style.animation = 'fadeOut 0.2s ease-in-out';
            setTimeout(() => {
                overlay.remove();
                resolve(value);
            }, 200);
        };

        // Submit button
        submitBtn.onclick = () => {
            const value = inputField.value.trim();
            cleanup(value || null);
        };

        // Cancel button
        cancelBtn.onclick = () => cleanup(null);

        // Close button
        document.getElementById('popupCloseBtn').onclick = () => cleanup(null);

        // Enter key to submit
        inputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const value = inputField.value.trim();
                cleanup(value || null);
            }
        });

        // Escape key to cancel
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                cleanup(null);
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // Click outside to cancel
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                cleanup(null);
            }
        };
    });
}

/**
 * Show patient already exists popup
 */
export function showPatientExists(existing) {
    const message = `
        <div class="popup-detail-item">
            <span class="popup-detail-label">Name:</span>
            <span class="popup-detail-value">${existing.name}</span>
        </div>
        <div class="popup-detail-item">
            <span class="popup-detail-label">Contact:</span>
            <span class="popup-detail-value">${existing.contact}</span>
        </div>
        <div class="popup-detail-item">
            <span class="popup-detail-label">Status:</span>
            <span class="popup-detail-value">${existing.status?.toUpperCase() || 'N/A'}</span>
        </div>
        <div class="popup-detail-item">
            <span class="popup-detail-label">Priority:</span>
            <span class="popup-detail-value">${existing.priority?.toUpperCase() || 'N/A'}</span>
        </div>
    `;
    
    return showPopup({
        title: 'Patient Already Exists',
        message,
        type: 'warning'
    });
}

/**
 * Show patient registered success
 */
export function showPatientRegistered(priority, patientId) {
    const message = `
        <p style="margin-bottom: 15px;">Patient has been successfully registered in the system.</p>
        <div class="popup-detail-item">
            <span class="popup-detail-label">Priority:</span>
            <span class="popup-detail-value" style="background: ${getPriorityColor(priority)}; color: white; padding: 4px 12px; border-radius: 12px; font-weight: bold;">${priority.toUpperCase()}</span>
        </div>
        <div class="popup-detail-item">
            <span class="popup-detail-label">Patient ID:</span>
            <span class="popup-detail-value">${patientId}</span>
        </div>
    `;
    
    return showSuccess('Patient Registered Successfully', message);
}

/**
 * Show room assigned success
 */
export function showRoomAssigned(roomNumber, patientName) {
    const message = `
        <p><strong>Room ${roomNumber}</strong> has been successfully assigned to <strong>${patientName}</strong>.</p>
    `;
    
    return showSuccess('Room Assigned', message);
}

/**
 * Show patient discharged success
 */
export function showPatientDischarged(patientName, roomNumber = null) {
    let message = `
        <p><strong>${patientName}</strong> has been discharged successfully and removed from the system.</p>
    `;
    
    if (roomNumber) {
        message += `<p style="margin-top: 10px; color: #66bb6a;"><strong>Room ${roomNumber}</strong> is now available.</p>`;
    }
    
    return showSuccess('Patient Discharged', message);
}

/**
 * Show confirm discharge dialog
 */
export async function showConfirmDischarge(patientName, roomNumber = null) {
    let message = `
        <p>Are you sure you want to discharge <strong>${patientName}</strong>?</p>
        <p style="margin-top: 15px; color: #666;">This action will:</p>
        <ul style="margin: 10px 0; padding-left: 20px; color: #666;">
            <li>Remove patient from the database</li>
            ${roomNumber ? `<li>Free up <strong>Room ${roomNumber}</strong></li>` : ''}
        </ul>
    `;
    
    return showPopup({
        title: 'Confirm Discharge',
        message,
        type: 'confirm',
        buttons: [
            { text: 'Cancel', style: 'secondary', onClick: () => false },
            { text: 'Yes, Discharge', style: 'danger', onClick: () => true }
        ]
    });
}

/**
 * Show patient details popup
 */
export function showPatientDetails(patient, waitTime) {
    const symptoms = patient.symptoms?.join(', ') || 'None';
    const vitals = patient.vitals || {};
    
    const message = `
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <h4 style="margin-bottom: 10px; color: #333;">👤 Patient Information</h4>
            <div class="popup-detail-item">
                <span class="popup-detail-label">Name:</span>
                <span class="popup-detail-value">${patient.name}</span>
            </div>
            <div class="popup-detail-item">
                <span class="popup-detail-label">Age:</span>
                <span class="popup-detail-value">${patient.age} years</span>
            </div>
            <div class="popup-detail-item">
                <span class="popup-detail-label">Contact:</span>
                <span class="popup-detail-value">${patient.contact}</span>
            </div>
            <div class="popup-detail-item">
                <span class="popup-detail-label">Complaint:</span>
                <span class="popup-detail-value">${patient.complaint}</span>
            </div>
            <div class="popup-detail-item">
                <span class="popup-detail-label">Priority:</span>
                <span class="popup-detail-value" style="background: ${getPriorityColor(patient.priority)}; color: white; padding: 4px 12px; border-radius: 12px; font-weight: bold;">${patient.priority.toUpperCase()}</span>
            </div>
            <div class="popup-detail-item">
                <span class="popup-detail-label">Status:</span>
                <span class="popup-detail-value">${patient.status.toUpperCase()}</span>
            </div>
            <div class="popup-detail-item">
                <span class="popup-detail-label">Wait Time:</span>
                <span class="popup-detail-value">${waitTime}</span>
            </div>
        </div>
        
        <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <h4 style="margin-bottom: 10px; color: #f57c00;">🩺 Vital Signs</h4>
            <div class="popup-detail-item">
                <span class="popup-detail-label">Blood Pressure:</span>
                <span class="popup-detail-value">${vitals.bloodPressure || 'N/A'}</span>
            </div>
            <div class="popup-detail-item">
                <span class="popup-detail-label">Pulse:</span>
                <span class="popup-detail-value">${vitals.pulse || 'N/A'} bpm</span>
            </div>
            <div class="popup-detail-item">
                <span class="popup-detail-label">Temperature:</span>
                <span class="popup-detail-value">${vitals.temperature || 'N/A'} °F</span>
            </div>
        </div>
        
        <div style="background: #e3f2fd; padding: 15px; border-radius: 8px;">
            <h4 style="margin-bottom: 10px; color: #1976d2;">💊 Symptoms</h4>
            <p>${symptoms}</p>
        </div>
        
        ${patient.notes ? `
        <div style="background: #f3e5f5; padding: 15px; border-radius: 8px; margin-top: 15px;">
            <h4 style="margin-bottom: 10px; color: #7b1fa2;">📝 Notes</h4>
            <p>${patient.notes}</p>
        </div>
        ` : ''}
    `;
    
    return showPopup({
        title: 'Patient Details',
        message,
        type: 'info'
    });
}

// ==================== UTILITY FUNCTIONS ====================

function getPriorityColor(priority) {
    const colors = {
        'red': '#ef5350',
        'yellow': '#ffa726',
        'green': '#66bb6a'
    };
    return colors[priority] || '#999';
}

// Add fadeOut animation to CSS if not exists
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
`;
document.head.appendChild(style);