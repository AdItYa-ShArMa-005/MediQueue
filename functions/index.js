/**
 * Firebase Cloud Functions for Triage System
 * Deploy: firebase deploy --only functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// ==================== TRIGGERS ====================

/**
 * Trigger when new patient is added
 * Automatically logs the action
 */
exports.onPatientCreated = functions.firestore
    .document('patients/{patientId}')
    .onCreate(async (snap, context) => {
        const patient = snap.data();
        const patientId = context.params.patientId;
        
        console.log(`New patient registered: ${patient.name}`);
        
        // Log audit
        await db.collection('audit_logs').add({
            action: 'registered',
            patientId: patientId,
            patientName: patient.name,
            performedBy: 'System',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            details: `Patient ${patient.name} registered with ${patient.priority} priority`
        });
        
        // Update statistics
        await updateStatistics();
        
        // Send notification for critical patients
        if (patient.priority === 'red') {
            console.log(`🚨 CRITICAL PATIENT ALERT: ${patient.name}`);
            // Here you can add push notification logic
        }
    });

/**
 * Trigger when patient is updated
 */
exports.onPatientUpdated = functions.firestore
    .document('patients/{patientId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        const patientId = context.params.patientId;
        
        // Log status changes
        if (before.status !== after.status) {
            await db.collection('audit_logs').add({
                action: 'status_changed',
                patientId: patientId,
                patientName: after.name,
                performedBy: 'System',
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                details: `Status changed from ${before.status} to ${after.status}`
            });
        }
        
        // Update statistics
        await updateStatistics();
    });

/**
 * Trigger when patient is deleted
 */
exports.onPatientDeleted = functions.firestore
    .document('patients/{patientId}')
    .onDelete(async (snap, context) => {
        const patient = snap.data();
        const patientId = context.params.patientId;
        
        await db.collection('audit_logs').add({
            action: 'deleted',
            patientId: patientId,
            patientName: patient.name,
            performedBy: 'System',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            details: `Patient ${patient.name} record deleted`
        });
        
        // Update statistics
        await updateStatistics();
    });

// ==================== SCHEDULED FUNCTIONS ====================

/**
 * Run every 5 minutes to check for long wait times
 */
exports.checkWaitTimes = functions.pubsub
    .schedule('*/5 * * * *')
    .onRun(async (context) => {
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);
        
        const snapshot = await db.collection('patients')
            .where('status', '==', 'waiting')
            .get();
        
        const alerts = [];
        
        snapshot.forEach(doc => {
            const patient = doc.data();
            if (patient.checkInTime && patient.checkInTime.toMillis() < oneHourAgo) {
                alerts.push({
                    patientId: doc.id,
                    name: patient.name,
                    priority: patient.priority,
                    waitTime: Math.floor((now - patient.checkInTime.toMillis()) / 1000 / 60)
                });
            }
        });
        
        if (alerts.length > 0) {
            console.log('⚠️ Long wait time alerts:', alerts);
            // Here you can send notifications to staff
        }
        
        return null;
    });

/**
 * Update statistics cache every 10 minutes
 */
exports.updateStatsScheduled = functions.pubsub
    .schedule('*/10 * * * *')
    .onRun(async (context) => {
        await updateStatistics();
        console.log('✅ Statistics updated');
        return null;
    });

// ==================== CALLABLE FUNCTIONS ====================

/**
 * Callable function to get detailed statistics
 */
exports.getDetailedStatistics = functions.https.onCall(async (data, context) => {
    const patientsSnapshot = await db.collection('patients')
        .where('status', '==', 'waiting')
        .get();
    
    const roomsSnapshot = await db.collection('rooms').get();
    
    const patients = [];
    patientsSnapshot.forEach(doc => {
        patients.push({ id: doc.id, ...doc.data() });
    });
    
    const rooms = [];
    roomsSnapshot.forEach(doc => {
        rooms.push({ id: doc.id, ...doc.data() });
    });
    
    // Calculate statistics
    const critical = patients.filter(p => p.priority === 'red');
    const urgent = patients.filter(p => p.priority === 'yellow');
    const normal = patients.filter(p => p.priority === 'green');
    
    // Calculate average wait times per priority
    const calculateAvgWait = (patientList) => {
        if (patientList.length === 0) return 0;
        const total = patientList.reduce((sum, p) => {
            if (p.checkInTime) {
                return sum + (Date.now() - p.checkInTime.toMillis()) / 1000 / 60;
            }
            return sum;
        }, 0);
        return Math.floor(total / patientList.length);
    };
    
    const occupiedRooms = rooms.filter(r => r.status === 'occupied').length;
    const availableRooms = rooms.filter(r => r.status === 'available').length;
    
    return {
        totalPatients: patients.length,
        critical: {
            count: critical.length,
            avgWaitTime: calculateAvgWait(critical)
        },
        urgent: {
            count: urgent.length,
            avgWaitTime: calculateAvgWait(urgent)
        },
        normal: {
            count: normal.length,
            avgWaitTime: calculateAvgWait(normal)
        },
        rooms: {
            total: rooms.length,
            occupied: occupiedRooms,
            available: availableRooms,
            occupancyRate: Math.floor((occupiedRooms / rooms.length) * 100)
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    };
});

/**
 * Bulk discharge patients
 */
exports.bulkDischarge = functions.https.onCall(async (data, context) => {
    const { patientIds } = data;
    
    if (!patientIds || !Array.isArray(patientIds)) {
        throw new functions.https.HttpsError('invalid-argument', 'patientIds must be an array');
    }
    
    const batch = db.batch();
    
    for (const patientId of patientIds) {
        const patientRef = db.collection('patients').doc(patientId);
        batch.update(patientRef, { status: 'discharged' });
    }
    
    await batch.commit();
    
    return {
        success: true,
        discharged: patientIds.length
    };
});

// ==================== HTTP ENDPOINTS ====================

/**
 * REST API endpoint to get all waiting patients
 */
exports.api = functions.https.onRequest(async (req, res) => {
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    
    const path = req.path.split('/').filter(p => p);
    
    try {
        // GET /api/patients
        if (req.method === 'GET' && path[0] === 'patients') {
            const snapshot = await db.collection('patients')
                .where('status', '==', 'waiting')
                .orderBy('priority')
                .orderBy('checkInTime')
                .get();
            
            const patients = [];
            snapshot.forEach(doc => {
                patients.push({ id: doc.id, ...doc.data() });
            });
            
            res.json({ success: true, data: patients });
            return;
        }
        
        // GET /api/stats
        if (req.method === 'GET' && path[0] === 'stats') {
            const stats = await updateStatistics();
            res.json({ success: true, data: stats });
            return;
        }
        
        // Default
        res.status(404).json({ success: false, message: 'Endpoint not found' });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== HELPER FUNCTIONS ====================

/**
 * Update statistics document
 */
async function updateStatistics() {
    const patientsSnapshot = await db.collection('patients')
        .where('status', '==', 'waiting')
        .get();
    
    const roomsSnapshot = await db.collection('rooms').get();
    
    const patients = [];
    patientsSnapshot.forEach(doc => {
        patients.push(doc.data());
    });
    
    const rooms = [];
    roomsSnapshot.forEach(doc => {
        rooms.push(doc.data());
    });
    
    const critical = patients.filter(p => p.priority === 'red').length;
    const urgent = patients.filter(p => p.priority === 'yellow').length;
    const normal = patients.filter(p => p.priority === 'green').length;
    
    // Calculate average wait time
    let avgWaitTime = 0;
    if (patients.length > 0) {
        const totalWait = patients.reduce((sum, patient) => {
            if (patient.checkInTime) {
                return sum + (Date.now() - patient.checkInTime.toMillis()) / 1000 / 60;
            }
            return sum;
        }, 0);
        avgWaitTime = Math.floor(totalWait / patients.length);
    }
    
    const occupied = rooms.filter(r => r.status === 'occupied').length;
    const available = rooms.filter(r => r.status === 'available').length;
    
    const stats = {
        totalPatients: patients.length,
        criticalCount: critical,
        urgentCount: urgent,
        normalCount: normal,
        averageWaitTime: avgWaitTime,
        roomsOccupied: occupied,
        roomsAvailable: available,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Update statistics document
    await db.collection('statistics').doc('current').set(stats);
    
    return stats;
}