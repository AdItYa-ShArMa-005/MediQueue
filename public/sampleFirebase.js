// Firebase Backend Service for Triage System
import { 
    db, 
    collection, 
    addDoc, 
    getDocs, 
    getDoc,
    doc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy, 
    limit,
    onSnapshot,
    serverTimestamp
} from './firebase-config.js';

// ==================== PATIENT OPERATIONS ====================

/**
 * Generate a token number based on patient priority and queue state
 */
 export async function generateTokenAndPosition(priority) {
    const patientsCollection = collection(db, "patients");
    const q = query(
        patientsCollection,
        where("status", "==", "waiting"),
        orderBy("checkInTime", "asc")
    );

    const snapshot = await getDocs(q);
    const patients = snapshot.docs.map(doc => doc.data());

    let baseToken = 0;
    let tokenSeriesStart = 0;

    if (priority === "green") {
        baseToken = patients.filter(p => p.priority === "green").length;
        tokenSeriesStart = 100;
    } else if (priority === "yellow") {
        baseToken = patients.filter(p => p.priority === "yellow").length;
        tokenSeriesStart = 200;
    } else if (priority === "red") {
        baseToken = patients.filter(p => p.priority === "red").length;
        tokenSeriesStart = 300;
    }

    const tokenNumber = tokenSeriesStart + baseToken + 1;

    // Determine position for scheduling
    let positionIndex = 0;
    if (priority === "red") {
        positionIndex = 0; // always front
    } else if (priority === "yellow") {
        // after last red but before most greens
        const redCount = patients.filter(p => p.priority === "red").length;
        const yellowCount = patients.filter(p => p.priority === "yellow").length;
        positionIndex = redCount + Math.floor(yellowCount / 2);
    } else {
        // after all reds and yellows
        const redCount = patients.filter(p => p.priority === "red").length;
        const yellowCount = patients.filter(p => p.priority === "yellow").length;
        positionIndex = redCount + yellowCount + patients.filter(p => p.priority === "green").length;
    }

    return { tokenNumber, positionIndex };
}


// ==================== PATIENT OPERATIONS ====================

/**
 * Add new patient
 */
export async function addPatient(patientData) {
    try {
        // ✅ Generate token number & queue position
        const { tokenNumber } = await generateTokenAndPosition(patientData.priority);

        const patient = {
            name: patientData.name,
            age: parseInt(patientData.age),
            contact: patientData.contact,
            complaint: patientData.complaint,
            priority: patientData.priority,
            tokenNumber: tokenNumber,  // ✅ Added token
            status: 'waiting',
            vitals: patientData.vitals || {},
            symptoms: patientData.symptoms || [],
            checkInTime: serverTimestamp(),
            assignedRoom: null,
            assignedRoomNumber: null,
            assignedDoctor: null,
            notes: patientData.notes || ''
        };

        const docRef = await addDoc(collection(db, 'patients'), patient);
        await logAudit('registered', docRef.id, patient.name);

        return { success: true, id: docRef.id, message: 'Patient registered successfully' };
    } catch (error) {
        console.error('Error adding patient:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Get all waiting patients (real-time)
 */
export function getWaitingPatients(callback) {
    const q = query(
        collection(db, 'patients'),
        where('status', '==', 'waiting'),
        orderBy('priority', 'asc'),
        orderBy('checkInTime', 'asc')
    );

    // Return unsubscribe function
    return onSnapshot(q, (snapshot) => {
        const patients = [];
        snapshot.forEach((doc) => {
            patients.push({
                id: doc.id,
                ...doc.data()
            });
        });
        callback(patients);
    }, (error) => {
        console.error('Error getting patients:', error);
        callback([]);
    });
}

/**
 * Get all patients (one-time fetch)
 */
export async function getAllPatients() {
    try {
        const q = query(
            collection(db, 'patients'),
            where('status', '==', 'waiting'),
            orderBy('priority', 'asc'),
            orderBy('checkInTime', 'asc')
        );

        const snapshot = await getDocs(q);
        const patients = [];
        
        snapshot.forEach((doc) => {
            patients.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return {
            success: true,
            data: patients
        };
    } catch (error) {
        console.error('Error getting patients:', error);
        return {
            success: false,
            message: error.message
        };
    }
}

/**
 * Get patients by priority
 */
export async function getPatientsByPriority(priority) {
    try {
        const q = query(
            collection(db, 'patients'),
            where('status', '==', 'waiting'),
            where('priority', '==', priority),
            orderBy('checkInTime', 'asc')
        );

        const snapshot = await getDocs(q);
        const patients = [];
        
        snapshot.forEach((doc) => {
            patients.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return {
            success: true,
            data: patients
        };
    } catch (error) {
        console.error('Error getting patients by priority:', error);
        return {
            success: false,
            message: error.message
        };
    }
}

/**
 * Get single patient by ID
 */
export async function getPatientById(patientId) {
    try {
        const docRef = doc(db, 'patients', patientId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return {
                success: true,
                data: {
                    id: docSnap.id,
                    ...docSnap.data()
                }
            };
        } else {
            return {
                success: false,
                message: 'Patient not found'
            };
        }
    } catch (error) {
        console.error('Error getting patient:', error);
        return {
            success: false,
            message: error.message
        };
    }
}

/**
 * Search patients by name or contact
 * ✅ UPDATED: Now fetches and includes room number
 */
export async function searchPatients(searchQuery) {
    try {
        const allPatientsSnapshot = await getDocs(collection(db, 'patients'));
        const results = [];
        
        const lowerQuery = searchQuery.toLowerCase();
        
        // First, collect all matching patients
        const matchingPatients = [];
        allPatientsSnapshot.forEach((doc) => {
            const data = doc.data();
            if (
                data.name.toLowerCase().includes(lowerQuery) ||
                data.contact.includes(searchQuery)
            ) {
                matchingPatients.push({
                    id: doc.id,
                    ...data
                });
            }
        });

        // Now fetch room numbers for patients with assigned rooms
        for (const patient of matchingPatients) {
            let roomNumber = null;
            
            // If patient has an assigned room, fetch the room details
            if (patient.assignedRoom) {
                try {
                    const roomDoc = await getDoc(doc(db, 'rooms', patient.assignedRoom));
                    if (roomDoc.exists()) {
                        roomNumber = roomDoc.data().roomNumber;
                    }
                } catch (error) {
                    console.error('Error fetching room for patient:', patient.id, error);
                }
            }
            
            results.push({
                ...patient,
                assignedRoomNumber: roomNumber  // ✅ Add room number to result
            });
        }

        return {
            success: true,
            data: results
        };
    } catch (error) {
        console.error('Error searching patients:', error);
        return {
            success: false,
            message: error.message
        };
    }
}

/**
 * Update patient
 */
export async function updatePatient(patientId, updates) {
    try {
        const docRef = doc(db, 'patients', patientId);
        await updateDoc(docRef, updates);

        return {
            success: true,
            message: 'Patient updated successfully'
        };
    } catch (error) {
        console.error('Error updating patient:', error);
        return {
            success: false,
            message: error.message
        };
    }
}

/**
 * Update patient status
 */
export async function updatePatientStatus(patientId, status) {
    try {
        const docRef = doc(db, 'patients', patientId);
        await updateDoc(docRef, {
            status: status
        });

        return {
            success: true,
            message: 'Status updated successfully'
        };
    } catch (error) {
        console.error('Error updating status:', error);
        return {
            success: false,
            message: error.message
        };
    }
}

/**
 * Assign room to patient
 * ✅ UPDATED: Now also stores room number
 */
export async function assignRoom(patientId, roomId, patientName) {
    try {
        // Get room details first to get room number
        const roomDoc = await getDoc(doc(db, 'rooms', roomId));
        const roomNumber = roomDoc.exists() ? roomDoc.data().roomNumber : null;

        // Update patient
        const patientRef = doc(db, 'patients', patientId);
        await updateDoc(patientRef, {
            assignedRoom: roomId,
            assignedRoomNumber: roomNumber,  // ✅ Store room number
            status: 'in-treatment'
        });

        // Update room
        const roomRef = doc(db, 'rooms', roomId);
        await updateDoc(roomRef, {
            status: 'occupied',
            assignedPatientId: patientId,
            assignedPatientName: patientName,
            assignedTime: serverTimestamp()
        });

        await logAudit('assigned_room', patientId, patientName);

        return {
            success: true,
            message: 'Room assigned successfully'
        };
    } catch (error) {
        console.error('Error assigning room:', error);
        return {
            success: false,
            message: error.message
        };
    }
}

/**
 * Discharge patient
 */
export async function dischargePatient(patientId, patientName, roomId) {
    try {
        // Delete patient from database (complete removal)
        await deleteDoc(doc(db, 'patients', patientId));

        // Free up room if assigned
        if (roomId) {
            const roomRef = doc(db, 'rooms', roomId);
            await updateDoc(roomRef, {
                status: 'available',
                assignedPatientId: null,
                assignedPatientName: null,
                assignedTime: null
            });
        }

        await logAudit('discharged', patientId, patientName);

        return {
            success: true,
            message: 'Patient discharged and removed successfully'
        };
    } catch (error) {
        console.error('Error discharging patient:', error);
        return {
            success: false,
            message: error.message
        };
    }
}

/**
 * Delete patient (permanent)
 */
export async function deletePatient(patientId) {
    try {
        await deleteDoc(doc(db, 'patients', patientId));

        return {
            success: true,
            message: 'Patient deleted successfully'
        };
    } catch (error) {
        console.error('Error deleting patient:', error);
        return {
            success: false,
            message: error.message
        };
    }
}

// ==================== ROOM OPERATIONS ====================

/**
 * Get all rooms (real-time)
 */
export function getAllRooms(callback) {
    const q = query(
        collection(db, 'rooms'),
        orderBy('roomNumber', 'asc')
    );

    return onSnapshot(q, (snapshot) => {
        const rooms = [];
        snapshot.forEach((doc) => {
            rooms.push({
                id: doc.id,
                ...doc.data()
            });
        });
        callback(rooms);
    }, (error) => {
        console.error('Error getting rooms:', error);
        callback([]);
    });
}

/**
 * Get available rooms
 */
export async function getAvailableRooms() {
    try {
        const q = query(
            collection(db, 'rooms'),
            where('status', '==', 'available'),
            orderBy('roomNumber', 'asc')
        );

        const snapshot = await getDocs(q);
        const rooms = [];
        
        snapshot.forEach((doc) => {
            rooms.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return {
            success: true,
            data: rooms
        };
    } catch (error) {
        console.error('Error getting available rooms:', error);
        return {
            success: false,
            message: error.message
        };
    }
}

/**
 * Add new room
 */
export async function addRoom(roomData) {
    try {
        const room = {
            roomNumber: roomData.roomNumber,
            status: 'available',
            assignedPatientId: null,
            assignedPatientName: null,
            assignedTime: null
        };

        const docRef = await addDoc(collection(db, 'rooms'), room);

        return {
            success: true,
            id: docRef.id,
            message: 'Room added successfully'
        };
    } catch (error) {
        console.error('Error adding room:', error);
        return {
            success: false,
            message: error.message
        };
    }
}

// ==================== STATISTICS ====================

/**
 * Get real-time statistics
 */
export async function getStatistics() {
    try {
        // Get all waiting patients
        const patientsSnapshot = await getDocs(
            query(collection(db, 'patients'))
        );

        const patients = [];
        patientsSnapshot.forEach((doc) => {
            patients.push(doc.data());
        });

        const critical = patients.filter(p => p.priority === 'red').length;
        const urgent = patients.filter(p => p.priority === 'yellow').length;
        const normal = patients.filter(p => p.priority === 'green').length;

        // Calculate average wait time
        let avgWaitTime = 0;
        if (patients.length > 0) {
            const totalWait = patients.reduce((sum, patient) => {
                if (patient.checkInTime) {
                    const checkIn = patient.checkInTime.toDate();
                    const wait = (Date.now() - checkIn.getTime()) / 1000 / 60; // minutes
                    return sum + wait;
                }
                return sum;
            }, 0);
            avgWaitTime = Math.floor(totalWait / patients.length);
        }

        // Get room statistics
        const roomsSnapshot = await getDocs(collection(db, 'rooms'));
        let roomsOccupied = 0;
        let roomsAvailable = 0;

        roomsSnapshot.forEach((doc) => {
            const room = doc.data();
            if (room.status === 'occupied') roomsOccupied++;
            if (room.status === 'available') roomsAvailable++;
        });

        return {
            success: true,
            data: {
                totalPatients: patients.length,
                criticalCount: critical,
                urgentCount: urgent,
                normalCount: normal,
                averageWaitTime: avgWaitTime,
                roomsOccupied: roomsOccupied,
                roomsAvailable: roomsAvailable
            }
        };
    } catch (error) {
        console.error('Error getting statistics:', error);
        return {
            success: false,
            message: error.message
        };
    }
}

// ==================== AUDIT LOG ====================

/**
 * Log audit action
 */
async function logAudit(action, patientId, patientName) {
    try {
        const log = {
            action: action,
            patientId: patientId,
            patientName: patientName,
            performedBy: 'System',
            timestamp: serverTimestamp(),
            details: `${action}: ${patientName}`
        };

        await addDoc(collection(db, 'audit_logs'), log);
    } catch (error) {
        console.error('Error logging audit:', error);
    }
}

/**
 * Get audit logs
 */
export async function getAuditLogs(limitCount = 50) {
    try {
        const q = query(
            collection(db, 'audit_logs'),
            orderBy('timestamp', 'desc'),
            limit(limitCount)
        );

        const snapshot = await getDocs(q);
        const logs = [];
        
        snapshot.forEach((doc) => {
            logs.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return {
            success: true,
            data: logs
        };
    } catch (error) {
        console.error('Error getting audit logs:', error);
        return {
            success: false,
            message: error.message
        };
    }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate priority based on symptoms and vitals
 */
export function calculatePriority(symptoms, vitals) {
    const criticalSymptoms = ['chest_pain', 'breathing', 'bleeding', 'unconscious'];
    
    // Check for critical symptoms
    if (symptoms.some(s => criticalSymptoms.includes(s))) {
        return 'red';
    }
    
    // Check for urgent conditions
    if (
        symptoms.includes('fever') || 
        symptoms.includes('pain') ||
        (vitals.pulse && vitals.pulse > 120) ||
        (vitals.temperature && vitals.temperature > 103)
    ) {
        return 'yellow';
    }
    
    return 'green';
}

/**
 * Format wait time
 */
export function formatWaitTime(checkInTime) {
    if (!checkInTime) return 'Unknown';
    
    const checkIn = checkInTime.toDate();
    const diff = Math.floor((Date.now() - checkIn.getTime()) / 1000 / 60); // minutes
    
    if (diff < 60) return `${diff} mins`;
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    return `${hours}h ${mins}m`;
}

// ==================== CHECK IF PATIENT EXISTS ====================
export async function checkIfPatientExists(name, contact) {
    try {
        const patientsRef = collection(db, "patients");
        const q = query(
            patientsRef,
            where("name", "==", name),
            where("contact", "==", contact)
        );
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            return { exists: true, data: snapshot.docs[0].data() };
        } else {
            return { exists: false };
        }
    } catch (error) {
        console.error("Error checking patient existence:", error);
        return { exists: false, error: error.message };
    }
}