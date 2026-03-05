const { db } = require('../src/firebase/admin');

module.exports = async (req, res) => {
  try {
    console.log('[test-fb] Testing Firestore write...');
    
    if (!db) {
      throw new Error('Firestore db is not initialized (db is null/undefined)');
    }

    const testDocRef = db.collection('emails').doc('test-' + Date.now());
    const testData = {
      test: true,
      createdAt: new Date().toISOString(),
      subject: 'Test email',
      from: 'test@example.com',
      body: 'This is a test document to verify Firestore connectivity',
      fetchedAt: new Date().toISOString(),
      userId: 'default-user-id',
      sender: 'test@example.com',
      isRead: false
    };

    await testDocRef.set(testData);
    console.log('[test-fb] Write successful to Firestore. Doc ID:', testDocRef.id);
    
    res.status(200).json({ 
      success: true, 
      message: 'Firestore write OK',
      docId: testDocRef.id,
      data: testData
    });
  } catch (e) {
    console.error('[test-fb] Error:', e.message);
    console.error('[test-fb] Stack:', e.stack);
    res.status(500).json({ 
      success: false, 
      error: e.message,
      stack: e.stack 
    });
  }
};
