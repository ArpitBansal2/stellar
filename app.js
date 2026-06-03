import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    deleteDoc,
    query,
    orderBy,
    where,
    serverTimestamp,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Firebase setup
const firebaseConfig = {
  apiKey: "AIzaSyDxir2kWDWAfRnWe-5KtZImTls0Iiexj9s",
  authDomain: "stellar-net-fcee6.firebaseapp.com",
  projectId: "stellar-net-fcee6",
  storageBucket: "stellar-net-fcee6.firebasestorage.app",
  messagingSenderId: "101106207112",
  appId: "1:101106207112:web:eee63537767e71c344d23d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// App state
let isLoginMode = false;
let currentUserData = null;
let viewingUserId = null;
let currentChatUnsubscribe = null;
let initialPageLoad = true;

function generateStars() {
    const wrap = document.getElementById("starscontainer");
    let count = 0;
    
    while (count < 180) {
        const star = document.createElement("div");
        const size = (Math.random() * 2.2) + 0.8;
        
        star.className = "star";
        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        star.style.left = `${Math.random() * 100}vw`;
        star.style.top = `${Math.random() * 100}vh`;
        star.style.animationDelay = `${Math.random() * 4}s`;
        star.style.animationDuration = `${(Math.random() * 3) + 2}s`;
        
        wrap.appendChild(star);
        count++;
    }
}

function getInitial(name) {
    if (!name) return "?";
    return name.charAt(0).toUpperCase();
}

function getChatId(uid1, uid2) {
    return uid1 < uid2 ? `${uid1}${uid2}` : `${uid2}${uid1}`;
}

function stopChatListener() {
    if (currentChatUnsubscribe) {
        currentChatUnsubscribe();
        currentChatUnsubscribe = null;
    }
}

function setAuthMode(loginMode) {
    isLoginMode = loginMode;
    
    const title = document.getElementById("auth-title");
    const btn = document.getElementById("auth-btn");
    const toggle = document.getElementById("authtoggle");
    const fields = document.getElementById("register-fields");
    const errBox = document.getElementById("auth-error");

    if (isLoginMode) {
        title.innerText = "Station Login";
        btn.innerText = "Access Terminal";
        toggle.innerText = "New recruit? Register here.";
        fields.style.display = "none";
    } else {
        title.innerText = "Station Onboarding";
        btn.innerText = "Initialize Profile";
        toggle.innerText = "Already stationed here? Login instead.";
        fields.style.display = "block";
    }
    
    errBox.style.display = "none";
    errBox.innerText = "";
}

function formatTimestamp(ts) {
    if (!ts || typeof ts.toDate !== 'function') {
        return "Just now";
    }
    
    const date = ts.toDate();
    return date.toLocaleString([], {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function escapeHtml(str) {
    if (!str) return "";
    
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function preserveScroll(callback) {
    const top = window.scrollY;
    callback();
    requestAnimationFrame(() => {
        window.scrollTo(0, top);
    });
}

generateStars();

window.switchPage = function (targetId) {
    preserveScroll(() => {
        const pages = document.querySelectorAll(".pagesection");
        for (let i = 0; i < pages.length; i++) {
            pages[i].classList.remove("activepage");
        }
        
        document.getElementById(targetId).classList.add("activepage");

        if (targetId !== "chat-page") {
            stopChatListener();
        }
        if (targetId === "home") {
            loadFeed();
        }

        const navs = document.querySelectorAll(".nav-item");
        navs.forEach((item) => {
            item.classList.remove("activelink");
        });

        if (targetId === "landing" && navs[0]) navs[0].classList.add("activelink");
        if (targetId === "home" && navs[1]) navs[1].classList.add("activelink");
        if (targetId === "crew" && navs[2]) navs[2].classList.add("activelink");
        if (targetId === "profile" && navs[3]) navs[3].classList.add("activelink");
    });
};

window.openAuthPage = function (mode) {
    setAuthMode(mode === "login");
    switchPage("auth");
};

window.toggleAuthMode = function () {
    setAuthMode(!isLoginMode);
};

window.handleAuth = async function () {
    const email = document.getElementById("auth-email").value.trim();
    const pass = document.getElementById("auth-password").value.trim();
    const user = document.getElementById("auth-username").value.trim();
    const dept = document.getElementById("auth-department").value;
    const errEl = document.getElementById("auth-error");

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, pass);
        } else {
            if (!user) {
                throw new Error("Call sign is required.");
            }
            
            const creds = await createUserWithEmailAndPassword(auth, email, pass);
            const profile = {
                username: user,
                department: dept,
                email: email,
                uid: creds.user.uid,
                status: "online",
                friends: [],
                bio: ""
            };
            
            await setDoc(doc(db, "users", creds.user.uid), profile);
            currentUserData = profile;
        }

        switchPage("home");
    } catch (err) {
        errEl.style.display = "block";
        errEl.innerText = err.message;
    }
};

window.logoutUser = async function () {
    try {
        if (auth.currentUser) {
            const userRef = doc(db, "users", auth.currentUser.uid);
            await updateDoc(userRef, { status: "offline" });
        }
    } catch (err) {
        console.error("Status update failed:", err);
    }
    
    stopChatListener();
    await signOut(auth);
    switchPage("landing");
};

onAuthStateChanged(auth, async (user) => {
    const nav = document.getElementById("main-nav");
    const authBox = document.getElementById("landing-auth-buttons");
    const enterBtn = document.getElementById("landing-enter-button");

    if (!user) {
        nav.style.display = "none";
        authBox.style.display = "flex";
        enterBtn.style.display = "none";
        currentUserData = null;
        viewingUserId = null;

        if (initialPageLoad) {
            initialPageLoad = false;
            switchPage("landing");
        }
        return;
    }

    nav.style.display = "flex";
    authBox.style.display = "none";
    enterBtn.style.display = "flex";

    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
        currentUserData = snap.data();
        if (!Array.isArray(currentUserData.friends)) currentUserData.friends = [];
        if (!currentUserData.bio) currentUserData.bio = "";
        await updateDoc(userRef, { status: "online" });
    }
    
    if (snap.exists()) {
        currentUserData = snap.data();
    } else {
        const fallback = {
            uid: user.uid,
            username: user.email.split("@")[0],
            department: "Engineering",
            bio: "",
            friends: [],
            status: "online"
        };
        await setDoc(userRef, fallback);
        const freshSnap = await getDoc(userRef);
        currentUserData = freshSnap.data();
    }
    
    if (initialPageLoad) {
        initialPageLoad = false;
        switchPage("landing");
    }
});

window.submitPost = async function () {
    const input = document.getElementById("postcontent");
    const txt = input.value.trim();
    
    if (!txt) return;
    if (!currentUserData || !auth.currentUser) return;

    try {
        await addDoc(collection(db, "posts"), {
            content: txt,
            authorId: auth.currentUser.uid,
            authorName: currentUserData.username,
            authorDept: currentUserData.department,
            likes: [],
            replies: [],
            timestamp: serverTimestamp()
        });

        input.value = "";
        loadFeed();
    } catch (err) {
        alert(`Could not send transmission: ${err.message}`);
    }
};

window.loadFeed = async function () {
    const feed = document.getElementById("global-feed-container");
    feed.innerHTML = "<p class='emptytext'>Fetching transmissions...</p>";

    try {
        const q = query(collection(db, "posts"), orderBy("timestamp", "desc"));
        const snap = await getDocs(q);

        if (snap.empty) {
            feed.innerHTML = "<p class='emptytext'>No messages yet.</p>";
            return;
        }

        feed.innerHTML = "";

        snap.forEach((docObj) => {
            const data = docObj.data();
            const pid = docObj.id;
            
            const likes = Array.isArray(data.likes) ? data.likes : [];
            const replies = Array.isArray(data.replies) ? data.replies : [];
            
            const hasLiked = auth.currentUser && likes.includes(auth.currentUser.uid);
            const likeClass = hasLiked ? "liked" : "";
            const isMine = auth.currentUser && data.authorId === auth.currentUser.uid;

            const delBtn = isMine
                ? `<button class="actionbtn deletebtn" onclick="deletePost('${pid}')">🗑️ Delete</button>`
                : "";

            let repliesHtml = "";
            if (replies.length > 0) {
                repliesHtml += `<div class="reply-list">`;
                replies.forEach((rep) => {
                    const name = escapeHtml(rep.authorName || "Crewmate");
                    const time = escapeHtml(rep.timeLabel || "Just now");
                    const body = escapeHtml(rep.text || "");
                    
                    repliesHtml += `
                        <div class="reply-item">
                            <div class="reply-meta"><strong>${name}</strong> · ${time}</div>
                            <div>${body}</div>
                        </div>
                    `;
                });
                repliesHtml += `</div>`;
            }

            feed.innerHTML += `
                <div class="feedpost">
                    <div class="post-shell">
                        <div class="postheader">
                            <div class="avatarcircle">${getInitial(data.authorName)}</div>
                            <div>
                                <strong>${escapeHtml(data.authorName || "Unknown")}</strong>
                                <div class="textsoft" style="font-size: 0.85rem;">[${escapeHtml(data.authorDept || "Crew")}] · ${formatTimestamp(data.timestamp)}</div>
                            </div>
                        </div>

                        <p class="postcontent">${escapeHtml(data.content || "")}</p>

                        <div class="postactions">
                            <button class="actionbtn ${likeClass}" onclick="toggleLike('${pid}')">♥️ Like (${likes.length})</button>
                            <button class="actionbtn" onclick="toggleReplyBox('${pid}')">↩️ Reply (${replies.length})</button>
                            ${delBtn}
                        </div>

                        <div class="replybox hidden" id="replybox-${pid}">
                            <div class="replyinputrow">
                                <input type="text" id="reply-input-${pid}" placeholder="Write a reply..." />
                                <button class="replybtn" onclick="addReply('${pid}')">Reply</button>
                            </div>
                            ${repliesHtml}
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (err) {
        console.log(err.message);
        feed.innerHTML = "<p class='emptytext'>Could not load transmissions.</p>";
    }
};

window.toggleReplyBox = function (pid) {
    const el = document.getElementById(`replybox-${pid}`);
    if (el) el.classList.toggle("hidden");
};

window.addReply = async function (pid) {
    if (!auth.currentUser || !currentUserData) return;
    
    const input = document.getElementById(`reply-input-${pid}`);
    const val = input.value.trim();
    if (!val) return;

    const postRef = doc(db, "posts", pid);
    const snap = await getDoc(postRef);
    if (!snap.exists()) return;

    const list = Array.isArray(snap.data().replies) ? snap.data().replies : [];
    
    const timeStr = new Date().toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });

    list.push({
        authorId: auth.currentUser.uid,
        authorName: currentUserData.username,
        text: val,
        timeLabel: timeStr
    });

    await updateDoc(postRef, { replies: list });
    input.value = "";
    loadFeed();
};

window.toggleLike = async function (pid) {
    const postRef = doc(db, "posts", pid);
    const snap = await getDoc(postRef);
    
    if (!snap.exists() || !auth.currentUser) return;

    let likes = snap.data().likes || [];
    const uid = auth.currentUser.uid;
    
    if (likes.includes(uid)) {
        likes = likes.filter((id) => id !== uid);
    } else {
        likes.push(uid);
    }

    await updateDoc(postRef, { likes });
    loadFeed();
};

window.deletePost = async function (pid) {
    if (confirm("Are you sure you want to delete this transmission?")) {
        await deleteDoc(doc(db, "posts", pid));
        loadFeed();
    }
};

window.loadCrewRoster = async function () {
    const container = document.getElementById("crewgrid-container");
    container.innerHTML = "<p class='emptytext'>Scanning personnel records...</p>";
    
    const snap = await getDocs(collection(db, "users"));
    container.innerHTML = "";

    snap.forEach((docObj) => {
        const data = docObj.data();
        if (auth.currentUser && data.uid === auth.currentUser.uid) return;

        const cls = data.status === "online" ? "statusonline" : "statusoffline";
        const lbl = data.status === "online" ? "Online" : "Offline";

        container.innerHTML += `
            <div class="profilecard" onclick="viewOtherProfile('${data.uid}')">
                <div class="avatarcircle crewgrid-avatar">${getInitial(data.username)}</div>
                <h3 style="margin: 0 0 0.4rem;">${escapeHtml(data.username || "Unknown")}</h3>
                <p class="textsoft" style="margin: 0 0 0.5rem;">${escapeHtml(data.department || "Crew")}</p>
                <p style="margin: 0;"><span class="status ${cls}"></span>${lbl}</p>
            </div>
        `;
    });

    if (container.innerHTML.trim() === "") {
        container.innerHTML = "<p class='emptytext'>No other crew members found yet.</p>";
    }
};

window.loadMyProfile = async function () {
    if (!currentUserData) return;
    
    document.getElementById("my-username").innerText = currentUserData.username;
    document.getElementById("my-dept").innerText = currentUserData.department;
    document.getElementById("my-bio-display").innerText = currentUserData.bio?.trim() ? currentUserData.bio : "No bio added yet.";
    document.getElementById("edit-username").value = currentUserData.username || "";
    document.getElementById("edit-bio").value = currentUserData.bio || "";

    const wrap = document.getElementById("my-friends-container");
    const friends = Array.isArray(currentUserData.friends) ? currentUserData.friends : [];

    if (friends.length === 0) {
        wrap.innerHTML = "<p class='emptytext'>No contacts added yet. Browse the crew roster.</p>";
        return;
    }

    wrap.innerHTML = "";
    const snap = await getDocs(collection(db, "users"));

    snap.forEach((docObj) => {
        const data = docObj.data();
        if (!friends.includes(data.uid)) return;

        wrap.innerHTML += `
            <div class="profilecard" onclick="viewOtherProfile('${data.uid}')">
                <div class="avatarcircle crewgrid-avatar">${getInitial(data.username)}</div>
                <h3 style="margin: 0 0 0.4rem;">${escapeHtml(data.username || "Unknown")}</h3>
                <p class="textsoft" style="margin: 0;">${escapeHtml(data.department || "Crew")}</p>
            </div>
        `;
    });

    if (wrap.innerHTML.trim() === "") {
        wrap.innerHTML = "<p class='emptytext'>No contacts added yet. Browse the crew roster.</p>";
    }
};

window.saveProfileEdits = async function () {
    if (!auth.currentUser || !currentUserData) return;

    const user = document.getElementById("edit-username").value.trim();
    const bio = document.getElementById("edit-bio").value.trim();

    if (!user) {
        alert("Username cannot be empty.");
        return;
    }

    await updateDoc(doc(db, "users", auth.currentUser.uid), {
        username: user,
        bio: bio
    });

    currentUserData.username = user;
    currentUserData.bio = bio;
    loadMyProfile();
};

window.viewOtherProfile = async function (uid) {
    viewingUserId = uid;
    switchPage("other-profile");
    
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return;

    const data = snap.data();
    document.getElementById("other-username").innerText = data.username;
    document.getElementById("other-dept").innerText = data.department;
    document.getElementById("other-bio-display").innerText = data.bio?.trim() ? data.bio : "No bio available.";

    const isOnline = data.status === "online";
    document.getElementById("other-status").className = `status ${isOnline ? "statusonline" : "statusoffline"}`;
    
    const txt = document.getElementById("other-status-text");
    txt.innerText = isOnline ? "Online" : "Offline";
    txt.className = isOnline ? "textonline" : "textsoft";

    const friends = Array.isArray(currentUserData?.friends) ? currentUserData.friends : [];
    const btn = document.getElementById("friend-btn");

    if (friends.includes(uid)) {
        btn.innerText = "✓ Remove Contact";
        btn.classList.add("friendadded");
    } else {
        btn.innerText = "+ Add to Contacts";
        btn.classList.remove("friendadded");
    }
};

window.toggleFriend = async function () {
    if (!viewingUserId || !auth.currentUser || !currentUserData) return;
    
    let friends = Array.isArray(currentUserData.friends) ? currentUserData.friends : [];

    if (friends.includes(viewingUserId)) {
        friends = friends.filter((id) => id !== viewingUserId);
    } else {
        friends.push(viewingUserId);
    }

    await updateDoc(doc(db, "users", auth.currentUser.uid), { friends: friends });
    currentUserData.friends = friends;

    const btn = document.getElementById("friend-btn");
    if (friends.includes(viewingUserId)) {
        btn.innerText = "✓ Remove Contact";
        btn.classList.add("friendadded");
    } else {
        btn.innerText = "+ Add to Contacts";
        btn.classList.remove("friendadded");
    }
};

window.openChat = async function () {
    if (!viewingUserId || !auth.currentUser) return;
    switchPage("chat-page");

    const uid1 = auth.currentUser.uid;
    const uid2 = viewingUserId;
    const cid = getChatId(uid1, uid2);
    
    const title = document.getElementById("other-username").innerText;
    document.getElementById("chat-title").innerText = `Secure Comm: ${title}`;

    const history = document.getElementById("chat-history");
    history.innerHTML = "<p class='emptytext'>Securing connection...</p>";
    stopChatListener();

    const q = query(collection(db, "messages"), where("chatId", "==", cid));

    currentChatUnsubscribe = onSnapshot(q, (snap) => {
        const msgs = [];
        snap.forEach((item) => {
            msgs.push(item.data());
        });
        
        msgs.sort((a, b) => {
            const t1 = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
            const t2 = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
            return t1 - t2;
        });

        history.innerHTML = "";
        if (msgs.length === 0) {
            history.innerHTML = "<p class='emptytext'>No messages yet. Send a transmission.</p>";
            return;
        }

        msgs.forEach((msg) => {
            const cls = msg.senderId === uid1 ? "chatsent" : "chatrecieved";
            history.innerHTML += `<div class="chatbubble ${cls}">${escapeHtml(msg.text)}</div>`;
        });
        
        history.scrollTop = history.scrollHeight;
    });
};

window.sendChatMessage = async function () {
    const input = document.getElementById("chat-input");
    const txt = input.value.trim();
    
    if (!txt || !auth.currentUser || !viewingUserId) return;

    const uid1 = auth.currentUser.uid;
    const uid2 = viewingUserId;
    input.value = "";

    await addDoc(collection(db, "messages"), {
        chatId: getChatId(uid1, uid2),
        senderId: uid1,
        text: txt,
        participants: [uid1, uid2],
        timestamp: serverTimestamp()
    });
};

document.getElementById("chat-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
        e.preventDefault();
        sendChatMessage();
    }
});
