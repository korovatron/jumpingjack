// Firestore access for the leaderboard. Exposes window.leaderboardService, or leaves it
// undefined if the SDK can't be loaded (e.g. offline) so the game carries on without it.
const FIREBASE_VERSION = "13.0.0";
const firebaseConfig = {
    apiKey: "AIzaSyDeH2xvZ5l3DIQJprlDuRQwvT-qLK81iMg",
    authDomain: "jumpingjack-431bb.firebaseapp.com",
    projectId: "jumpingjack-431bb",
    storageBucket: "jumpingjack-431bb.firebasestorage.app",
    messagingSenderId: "356304503585",
    appId: "1:356304503585:web:c3019f9ee886846b2df460"
};

try {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
    const [{ initializeApp }, firestore] = await Promise.all([
        import(base + "firebase-app.js"),
        import(base + "firebase-firestore.js")
    ]);
    const { getFirestore, collection, query, orderBy, limit, getDocs, addDoc, serverTimestamp } = firestore;

    const db = getFirestore(initializeApp(firebaseConfig));
    const scores = collection(db, "scores");

    window.leaderboardService = {
        async fetchTop(count) {
            const snapshot = await getDocs(query(scores, orderBy("score", "desc"), limit(count)));
            return snapshot.docs.map(doc => {
                const { name, score, level, createdAt } = doc.data();
                // createdAt can be null for an instant after submit, before the server timestamp resolves
                return { name, score, level, createdAt: createdAt ? createdAt.toDate() : null };
            });
        },
        async submit({ name, score, level }) {
            await addDoc(scores, { name, score, level, createdAt: serverTimestamp() });
        }
    };
} catch (err) {
    console.warn("Leaderboard unavailable:", err);
}

window.leaderboardReady = true;
window.dispatchEvent(new Event("leaderboard-ready"));
