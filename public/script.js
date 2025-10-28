// Import Firebase services
import { 
    addPatient,
    getWaitingPatients,
    searchPatients,
    dischargePatient,
    updatePatientStatus,
    getStatistics,
    calculatePriority,
    formatWaitTime,
    getAllRooms,
    getAvailableRooms,
    addRoom,
    assignRoom,
    getPatientById,
    checkIfPatientExists
}

from './firebase-service.js';

// Global variables
let unsubscribePatients = null;
let unsubscribeRooms = null;
let currentPatientForRoom = null;

// Priority order mapping for sorting
const priorityOrder = { red: 1, yellow: 2, green: 3 };

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Triage System Initialized');
    
    // Start listening for real-time patient updates
    startRealtimeUpdates();
    
    // Check existing rooms first
    const roomsResult = await getAvailableRooms();
    if (roomsResult.success && roomsResult.data.length === 0) {
        // Only create rooms if none exist
        await addRoom({roomNumber: `R${1}`});
        await addRoom({roomNumber: `R${2}`});
        await addRoom({roomNumber: `R${3}`});
        await addRoom({roomNumber: `R${4}`});
        await addRoom({roomNumber: `R${5}`});
    }
    
    // Start listening for real-time room updates
    startRoomUpdates();
    
    // Load statistics
    loadStatistics();
    
    // Set up form handlers
    setupFormHandlers();
    
    // Update statistics every 30 seconds
    setInterval(loadStatistics, 30000);
});

// ==================== REAL-TIME UPDATES ====================

function startRealtimeUpdates() {
    if (unsubscribePatients) {
        unsubscribePatients();
    }
    
    unsubscribePatients = getWaitingPatients((patients) => {
        renderQueue(patients);
        updateStatsFromPatients(patients);
    });
}

// ==================== FORM HANDLERS ====================

function setupFormHandlers() {
    const newPatientForm = document.getElementById('newPatientForm');
    if (newPatientForm) {
        newPatientForm.addEventListener('submit', handleNewPatientSubmit);
    }
    
    const searchForm = document.getElementById('searchPatientForm');
    if (searchForm) {
        searchForm.addEventListener('submit', handleSearchSubmit);
    }
}


async function handleNewPatientSubmit(e) {
    e.preventDefault();
    
    // Collect symptoms
    const symptoms = [];
    document.querySelectorAll('.checkbox-item input:checked').forEach(checkbox => {
        symptoms.push(checkbox.value);
    });
    
    // Collect vitals
    const vitals = {
        bloodPressure: document.getElementById('newBP').value || '',
        pulse: parseInt(document.getElementById('newPulse').value) || 0,
        temperature: parseFloat(document.getElementById('newTemp').value) || 0
    };

    // Get name & contact
    const name = document.getElementById('newName').value.trim();
    const contact = document.getElementById('newContact').value.trim();

    if (!name || !contact) {
        alert("⚠ Please enter both name and contact number.");
        return;
    }

    // Check if patient already exists
    // const { checkIfPatientExists } = await import('./firebase-service.js');
    const existResult = await checkIfPatientExists(name, contact);

    if (existResult.exists) {
        const existing = existResult.data;
        alert(
          `⚠ Patient already exists!\n\nName: ${existing.name}\nContact: ${existing.contact}\nStatus: ${existing.status?.toUpperCase() || 'N/A'}\nPriority: ${existing.priority?.toUpperCase() || 'N/A'}`
        );
        return; // Stop here — don’t register again
    }

    // Calculate priority
    const priority = calculatePriority(symptoms, vitals);
    
    // Prepare patient data
    const patientData = {
        name,
        age: document.getElementById('newAge').value,
        contact,
        complaint: document.getElementById('newComplaint').value,
        symptoms,
        vitals,
        priority
    };
    
    // Show loading
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Registering...';
    submitBtn.disabled = true;
    
    // Add to Firebase
    const result = await addPatient(patientData);
    
    if (result.success) {
       ` alert(✅ Patient registered successfully!\n\nPriority: ${priority.toUpperCase()}\nPatient ID: ${result.id});`
        e.target.reset();
        loadStatistics();
    } else {
        `alert(❌ Error: ${result.message});`
    }
    
    // Restore button
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
}

async function handleSearchSubmit(e) {
    e.preventDefault();
    
    const query = document.getElementById('searchQuery').value.trim();
    
    if (!query) {
        alert('Please enter a search term');
        return;
    }
    
    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.innerHTML = '<p style="text-align: center; padding: 20px;">Searching...</p>';
    resultsDiv.classList.remove('hidden');
    
    const result = await searchPatients(query);
    
    if (result.success && result.data.length > 0) {
        displaySearchResults(result.data);
    } else {
        resultsDiv.innerHTML = '<div class="search-result"><p>No patients found matching your search.</p></div>';
    }
}

// ==================== UI RENDERING ====================

function renderQueue(patients) {
    const queueList = document.getElementById('queueList');
    
    if (!patients || patients.length === 0) {
        queueList.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">No patients in queue. Register a new patient to get started.</p>';
        return;
    }
    
    const sortedPatients = [...patients].sort((a, b) => {
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        const timeA = a.checkInTime?.toDate?.() || new Date(0);
        const timeB = b.checkInTime?.toDate?.() || new Date(0);
        return timeA - timeB;
    });
    
    queueList.innerHTML = sortedPatients.map(patient => {
        const borderColor = patient.priority === 'red' ? '#ef5350' : 
                           patient.priority === 'yellow' ? '#ffa726' : '#66bb6a';
        const priorityText = patient.priority === 'red' ? 'CRITICAL' : 
                            patient.priority === 'yellow' ? 'URGENT' : 'NON-URGENT';
        
        const waitTime = formatWaitTime(patient.checkInTime);
        
        return `
            <div class="patient-card" style="border-left-color: ${borderColor}">
                <div class="patient-info">
                    <h3>👤 ${patient.name}</h3>
                    <p><strong>Age:</strong> ${patient.age} | <strong>Contact:</strong> ${patient.contact}</p>
                    <p><strong>Complaint:</strong> ${patient.complaint}</p>
                    <p><strong>Wait Time:</strong> ${waitTime}</p>
                    <span class="priority-badge priority-${patient.priority}">${priorityText}</span>
                </div>
                <div class="patient-actions">
                    <button onclick="viewPatientDetails('${patient.id}')">View Details</button>
                    <button onclick="showRoomAssignment('${patient.id}', '${patient.name.replace(/'/g, "\\'")}')">Assign Room</button>
                    <button onclick="confirmDischarge('${patient.id}', '${patient.name.replace(/'/g, "\\'")}')">Discharge</button>
                </div>
            </div>
        `;
    }).join('');
}

function displaySearchResults(results) {
    const resultsDiv = document.getElementById('searchResults');
    
    resultsDiv.innerHTML = results.map(patient => {
        const priorityText = patient.priority === 'red' ? 'CRITICAL' : 
                            patient.priority === 'yellow' ? 'URGENT' : 'NON-URGENT';
        
        const checkInDate = patient.checkInTime?.toDate?.() || new Date();
        const formattedDate = checkInDate.toLocaleString();
        
        return `
            <div class="search-result">
                <h3>Patient: ${patient.name}</h3>
                <p><strong>Age:</strong> ${patient.age} | <strong>Contact:</strong> ${patient.contact}</p>
                <p><strong>Complaint:</strong> ${patient.complaint}</p>
                <p><strong>Status:</strong> ${patient.status.toUpperCase()}</p>
                <p><strong>Check-in:</strong> ${formattedDate}</p>
                <span class="priority-badge priority-${patient.priority}">${priorityText}</span>
            </div>
        `;
    }).join('');
}

window.viewPatientDetails = async function(patientId) {
    const result = await getPatientById(patientId);
    
    if (result.success) {
        const patient = result.data;
        const symptoms = patient.symptoms?.join(', ') || 'None';
        const vitals = patient.vitals || {};
        const waitTime = formatWaitTime(patient.checkInTime);
        
        const details = `
Patient Details:

Name: ${patient.name}
Age: ${patient.age}
Contact: ${patient.contact}
Complaint: ${patient.complaint}
Priority: ${patient.priority.toUpperCase()}
Status: ${patient.status.toUpperCase()}

Symptoms: ${symptoms}

Vital Signs:
- Blood Pressure: ${vitals.bloodPressure || 'N/A'}
- Pulse: ${vitals.pulse || 'N/A'} bpm
- Temperature: ${vitals.temperature || 'N/A'} °F

Wait Time: ${waitTime}
Notes: ${patient.notes || 'None'}
        `;
        
        alert(details);
    } else {
        alert(`Error: ${result.message}`);
    }
}

// ==================== STATISTICS ====================

async function loadStatistics() {
    const result = await getStatistics();
    
    if (result.success) {
        const stats = result.data;
        
        document.getElementById('totalPatients').textContent = stats.totalPatients;
        document.getElementById('criticalCount').textContent = stats.criticalCount;
        document.getElementById('urgentCount').textContent = stats.urgentCount;
        document.getElementById('normalCount').textContent = stats.normalCount;
    }
}

function updateStatsFromPatients(patients) {
    const total = patients.length;
    const critical = patients.filter(p => p.priority === 'red').length;
    const urgent = patients.filter(p => p.priority === 'yellow').length;
    const normal = patients.filter(p => p.priority === 'green').length;
    
    document.getElementById('totalPatients').textContent = total;
    document.getElementById('criticalCount').textContent = critical;
    document.getElementById('urgentCount').textContent = urgent;
    document.getElementById('normalCount').textContent = normal;
}

// ==================== CLEANUP ====================

window.addEventListener('beforeunload', () => {
    if (unsubscribePatients) {
        unsubscribePatients();
    }
    if (unsubscribeRooms) {
        unsubscribeRooms();
    }
});

// ==================== ROOM MANAGEMENT ====================

function startRoomUpdates() {
    if (unsubscribeRooms) {
        unsubscribeRooms();
    }
    
    unsubscribeRooms = getAllRooms((rooms) => {
        renderRooms(rooms);
    });
}

/**
 * Render rooms grid - NOW WITH CLICK FUNCTIONALITY
 */
function renderRooms(rooms) {
    const roomsList = document.getElementById('roomsList');
    
    if (!rooms || rooms.length === 0) {
        roomsList.innerHTML = '<p style="text-align: center; color: #999; padding: 40px; grid-column: 1/-1;">No rooms available.</p>';
        return;
    }
    
    roomsList.innerHTML = rooms.map(room => {
        const statusClass = room.status === 'available' ? 'available' : 'occupied';
        const statusText = room.status === 'available' ? 'AVAILABLE' : 'OCCUPIED';
        
        // Make room clickable if occupied
        const clickable = room.status === 'occupied' ? 
            `onclick="showRoomPatientDetails('${room.id}', '${room.assignedPatientId}', '${room.assignedPatientName?.replace(/'/g, "\\'")}', '${room.roomNumber}')" style="cursor: pointer;"` : 
            '';
        
        return `
            <div class="room-card ${statusClass}" ${clickable}>
                <h3>🚪 ${room.roomNumber}</h3>
                ${room.assignedPatientName ? `<p><strong>${room.assignedPatientName}</strong></p>` : '<p>No patient assigned</p>'}
                <span class="status-badge">${statusText}</span>
                ${room.status === 'occupied' ? '<p style="font-size: 12px; margin-top: 8px; color: #666;">Click for details</p>' : ''}
            </div>
        `;
    }).join('');
}

/**
 * NEW FUNCTION: Show patient details when room is clicked
 */
window.showRoomPatientDetails = async function(roomId, patientId, patientName, roomNumber) {
    console.log('Room clicked:', roomNumber, 'Patient:', patientName);
    
    if (!patientId) {
        alert('No patient assigned to this room');
        return;
    }
    
    // Get full patient details
    const result = await getPatientById(patientId);
    
    if (!result.success) {
        alert(`Error loading patient details: ${result.message}`);
        return;
    }
    
    const patient = result.data;
    const symptoms = patient.symptoms?.join(', ') || 'None';
    const vitals = patient.vitals || {};
    const waitTime = formatWaitTime(patient.checkInTime);
    
    // Create a custom modal with patient details and discharge button
    const modal = document.createElement('div');
    modal.id = 'patientDetailsModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
    `;
    
    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 15px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
            <h2 style="color: #667eea; margin-bottom: 20px;">🏥 Room ${roomNumber} - Patient Details</h2>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <h3 style="margin-bottom: 15px; color: #333;">👤 ${patient.name}</h3>
                
                <p style="margin: 8px 0;"><strong>Age:</strong> ${patient.age} years</p>
                <p style="margin: 8px 0;"><strong>Contact:</strong> ${patient.contact}</p>
                <p style="margin: 8px 0;"><strong>Complaint:</strong> ${patient.complaint}</p>
                <p style="margin: 8px 0;"><strong>Priority:</strong> <span style="background: ${patient.priority === 'red' ? '#ef5350' : patient.priority === 'yellow' ? '#ffa726' : '#66bb6a'}; color: white; padding: 4px 12px; border-radius: 12px; font-weight: bold;">${patient.priority.toUpperCase()}</span></p>
                <p style="margin: 8px 0;"><strong>Status:</strong> ${patient.status.toUpperCase()}</p>
                <p style="margin: 8px 0;"><strong>Wait Time:</strong> ${waitTime}</p>
                <p style="margin: 8px 0;"><strong>Assigned Room:</strong> ${roomNumber}</p>
            </div>
            
            <div style="background: #fff3e0; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
                <h4 style="margin-bottom: 10px; color: #f57c00;">🩺 Vital Signs</h4>
                <p style="margin: 5px 0;">Blood Pressure: ${vitals.bloodPressure || 'N/A'}</p>
                <p style="margin: 5px 0;">Pulse: ${vitals.pulse || 'N/A'} bpm</p>
                <p style="margin: 5px 0;">Temperature: ${vitals.temperature || 'N/A'} °F</p>
            </div>
            
            <div style="background: #e3f2fd; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
                <h4 style="margin-bottom: 10px; color: #1976d2;">💊 Symptoms</h4>
                <p>${symptoms}</p>
            </div>
            
            ${patient.notes ? `
            <div style="background: #f3e5f5; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
                <h4 style="margin-bottom: 10px; color: #7b1fa2;">📝 Notes</h4>
                <p>${patient.notes}</p>
            </div>
            ` : ''}
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="closePatientDetailsModal()" style="background: #999; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 16px;">Close</button>
                <button onclick="dischargePatientFromRoom('${patientId}', '${patient.name.replace(/'/g, "\\'")}', '${roomId}', '${roomNumber}')" style="background: linear-gradient(135deg, #ef5350 0%, #e53935 100%); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold;">🚪 Discharge Patient</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closePatientDetailsModal();
        }
    });
}

/**
 * NEW FUNCTION: Close patient details modal
 */
window.closePatientDetailsModal = function() {
    const modal = document.getElementById('patientDetailsModal');
    if (modal) {
        modal.remove();
    }
}

/**
 * NEW FUNCTION: Discharge patient from room modal
 */
window.dischargePatientFromRoom = async function(patientId, patientName, roomId, roomNumber) {
    if (confirm(`Are you sure you want to discharge ${patientName}?\n\nThis will:\n✓ Remove patient from database\n✓ Free up Room ${roomNumber}`)) {
        
        const result = await dischargePatient(patientId, patientName, roomId);
        
        if (result.success) {
            alert(`✅ ${patientName} has been discharged successfully!\n\nRoom ${roomNumber} is now available.`);
            closePatientDetailsModal();
            loadStatistics();
        } else {
            alert(`❌ Error: ${result.message}`);
        }
    }
}

window.showRoomAssignment = async function(patientId, patientName) {
    console.log('Opening room assignment for:', patientId, patientName);
    
    currentPatientForRoom = { id: patientId, name: patientName };
    
    const modal = document.getElementById('roomModal');
    modal.style.display = 'flex';
    
    document.getElementById('modalPatientInfo').textContent = 
        `Assigning room for: ${patientName}`;
    
    const roomsList = document.getElementById('availableRoomsList');
    roomsList.innerHTML = '<p style="text-align: center; padding: 20px;">Loading available rooms...</p>';
    
    const result = await getAvailableRooms();
    
    console.log('Available rooms result:', result);
    
    if (!result.success) {
        roomsList.innerHTML = `<p style="color: red; padding: 20px;">Error: ${result.message}</p>`;
        return;
    }
    
    if (result.data.length === 0) {
        roomsList.innerHTML = '<p style="color: orange; padding: 20px;">❌ No available rooms. All rooms are currently occupied.</p>';
        return;
    }
    
    roomsList.innerHTML = result.data.map(room => `
        <div style="padding: 15px; margin: 10px 0; background: #e8f5e9; border-radius: 8px; border: 2px solid #66bb6a; cursor: pointer; transition: transform 0.2s;" 
             onclick="assignRoomToPatient('${room.id}', '${room.roomNumber}')"
             onmouseover="this.style.transform='scale(1.02)'"
             onmouseout="this.style.transform='scale(1)'">
            <strong style="font-size: 1.2em;">🚪 Room ${room.roomNumber}</strong>
            <p style="margin: 5px 0 0 0; color: #66bb6a; font-weight: bold;">AVAILABLE</p>
        </div>
    `).join('');
}

window.assignRoomToPatient = async function(roomId, roomNumber) {
    if (!currentPatientForRoom) {
        alert('❌ Error: No patient selected');
        return;
    }
    
    console.log('Assigning room:', roomId, 'to patient:', currentPatientForRoom.id);
    
    const roomsList = document.getElementById('availableRoomsList');
    roomsList.innerHTML = '<p style="text-align: center; padding: 20px;">Assigning room...</p>';
    
    const result = await assignRoom(
        currentPatientForRoom.id, 
        roomId, 
        currentPatientForRoom.name
    );
    
    console.log('Assignment result:', result);
    
    if (result.success) {
        alert(`✅ Room ${roomNumber} assigned to ${currentPatientForRoom.name}`);
        closeRoomModal();
        loadStatistics();
    } else {
        alert(`❌ Error assigning room: ${result.message}`);
        showRoomAssignment(currentPatientForRoom.id, currentPatientForRoom.name);
    }
}

window.closeRoomModal = function() {
    document.getElementById('roomModal').style.display = 'none';
    currentPatientForRoom = null;
}

window.confirmDischarge = async function(patientId, patientName) {
    if (confirm(`Are you sure you want to discharge ${patientName}?\n\nThis will:\n- Remove patient from database\n- Free up assigned room (if any)`)) {
        
        const patientResult = await getPatientById(patientId);
        let roomId = null;
        
        if (patientResult.success && patientResult.data.assignedRoom) {
            roomId = patientResult.data.assignedRoom;
        }
        
        const result = await dischargePatient(patientId, patientName, roomId);
        
        if (result.success) {
            alert(`✅ ${patientName} has been discharged successfully and removed from the system`);
            loadStatistics();
        } else {
            alert(`❌ Error: ${result.message}`);
        }
    }
}