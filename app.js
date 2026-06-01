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

const firebaseConfig = {
    apiKey: "AIzaSyDxir2kWDWAfRnWe-5KtZImTls0Iiexj9s",
    authDomain: "stellar-net-fcee6.firebaseapp.com",
    projectId: "stellar-net-fcee6",
    storageBucket: "stellar-net-fcee6.firebasestorage.app",
    messagingSenderId: "1.01106207112e+11",
    appId: "1:1.01106207112e+11:web:eee63537767e71c344d23d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let isLoginMode = false;
let currentUserData = null;
let viewingUserId = null;
let currentChatUnsubscribe = null;
let initialPageLoad = true;

// creates little star dots and scatters them around the background
function generateStars() {
    const container = document.getElementById("stars-wrapper");
    for (let i = 0; i < 180; i++) {
        const star = document.createElement("div");
        const size = Math.random() * 2.2 + 0.8;
        star.className = "star";
        star.style.width = size + "px";
        star.style.height = size + "px";
        star.style.left = Math.random() * 100 + "vw";
        star.style.top = Math.random() * 100 + "vh";
        star.style.animationDelay = Math.random() * 4 + "s";
        star.style.animationDuration = Math.random() * 3 + 2 + "s";
        container.appendChild(star);
    }
}

function getInitial(name) {
    // just grab the first letter
    var firstChar = name ? name.charAt(0).toUpperCase() : "?";
    return firstChar;
}

function getChatId(uidOne, uidTwo) {
    // sort IDs so the chat room is always the same regardless of who opens it
    if (uidOne < uidTwo) {
        return uidOne + "_" + uidTwo;
    } else {
        return uidTwo + "_" + uidOne;
    }
}

function stopChatListener() {
    if (currentChatUnsubscribe) {
        currentChatUnsubscribe();
        currentChatUnsubscribe = null;
    }
}

function setAuthMode(loginMode) {
    isLoginMode = loginMode;
    document.getElementById("auth-title").innerText = isLoginMode ? "Station Login" : "Station Onboarding";
    document.getElementById("auth-btn").innerText = isLoginMode ? "Access Terminal" : "Initialize Profile";
    document.getElementById("authtoggle").innerText = isLoginMode ? "New recruit? Register here." : "Already stationed here? Login instead.";
    document.getElementById("register-fields").style.display = isLoginMode ? "none" : "block";
    document.getElementById("auth-error").style.display = "none";
    document.getElementById("auth-error").innerText = "";
}

function formatTimestamp(timestamp) {
    if (!timestamp || !timestamp.toDate) return "Just now";
    return timestamp.toDate().toLocaleString([], {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function preserveScroll(action) {
    const currentTop = window.scrollY;
    action();
    requestAnimationFrame(() => window.scrollTo(0, currentTop));
}

generateStars();

window.switchPage = function (targetPageId) {
    preserveScroll(() => {
        document.querySelectorAll(".page-section").forEach((page) => page.classList.remove("active-page"));
        document.getElementById(targetPageId).classList.add("active-page");

        if (targetPageId !== "chat-page") stopChatListener();
        if (targetPageId === "home") loadFeed();

        const navItems = document.querySelectorAll(".nav-item");
        navItems.forEach((item) => item.classList.remove("active-link"));

        if (targetPageId === "landing" && navItems[0]) navItems[0].classList.add("active-link");
        if (targetPageId === "home" && navItems[1]) navItems[1].classList.add("active-link");
        if (targetPageId === "crew" && navItems[2]) navItems[2].classList.add("active-link");
        if (targetPageId === "profile" && navItems[3]) navItems[3].classList.add("active-link");
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
    const password = document.getElementById("auth-password").value.trim();
    const errorBox = document.getElementById("auth-error");
    errorBox.style.display = "none";
    errorBox.innerText = "";

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
            switchPage("landing");
        } else {
            const username = document.getElementById("auth-username").value.trim();
            const department = document.getElementById("auth-department").value;
            if (!username) {
                errorBox.innerText = "Please enter a call sign.";
                errorBox.style.display = "block";
                return;
            }
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const newUser = userCredential.user;
            await setDoc(doc(db, "users", newUser.uid), {
                uid: newUser.uid,
                username,
                department,
                bio: "",
                friends: [],
                status: "online"
            });
            switchPage("landing");
        }
    } catch (err) {
        errorBox.innerText = err.message;
        errorBox.style.display = "block";
    }
};

window.logoutUser = async function () {
    await updateDoc(doc(db, "users", auth.currentUser.uid), { status: "offline" });
    await signOut(auth);
    currentUserData = null;
    switchPage("landing");
};

onAuthStateChanged(auth, async (user) => {
    const mainNav = document.getElementById("main-nav");
    const authButtons = document.getElementById("landing-auth-buttons");
    const enterButton = document.getElementById("landing-enter-button");

    if (!user) {
        mainNav.style.display = "none";
        authButtons.style.display = "flex";
        enterButton.style.display = "none";
        currentUserData = null;
        viewingUserId = null;

        if (initialPageLoad) {
            initialPageLoad = false;
            switchPage("landing");
        }
        return;
    }

    mainNav.style.display = "flex";
    authButtons.style.display = "none";
    enterButton.style.display = "flex";

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        currentUserData = userSnap.data();
        if (!Array.isArray(currentUserData.friends)) currentUserData.friends = [];
        if (!currentUserData.bio) currentUserData.bio = "";
        await updateDoc(userRef, { status: "online" });
    }

    if (initialPageLoad) {
        initialPageLoad = false;
        switchPage("landing");
    }
});

window.submitPost = async function () {
    const postBox = document.getElementById("postcontent");
    const content = postBox.value.trim();
    if (!content) return;
    if (!currentUserData || !auth.currentUser) return;

    try {
        await addDoc(collection(db, "posts"), {
            content,
            authorId: auth.currentUser.uid,
            authorName: currentUserData.username,
            authorDept: currentUserData.department,
            likes: [],
            replies: [],
            timestamp: serverTimestamp()
        });
        postBox.value = "";
        loadFeed();
    } catch (error) {
        alert("Could not send transmission: " + error.message);
    }
};

window.loadFeed = async function () {
    const feedContainer = document.getElementById("feed-container");
    feedContainer.innerHTML = "<p class='empty-state'>Fetching transmissions...</p>";

    try {
        const postQuery = query(collection(db, "posts"), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(postQuery);

        if (querySnapshot.empty) {
            feedContainer.innerHTML = "<p class='empty-state'>No logs found in this sector.</p>";
            return;
        }

        feedContainer.innerHTML = "";

        querySnapshot.forEach((postDocument) => {
            const postData = postDocument.data();
            const postId = postDocument.id;
            const likesArray = Array.isArray(postData.likes) ? postData.likes : [];
            const repliesArray = Array.isArray(postData.replies) ? postData.replies : [];
            const userHasLiked = auth.currentUser && likesArray.includes(auth.currentUser.uid);
            const likeClass = userHasLiked ? "liked" : "";
            const isMyPost = auth.currentUser && postData.authorId === auth.currentUser.uid;

            const deleteButtonHtml = isMyPost
                ? `<button class="action-btn delete-btn" onclick="deletePost('${postId}')">🗑 Delete</button>`
                : "";

            let repliesHtml = "";
            if (repliesArray.length > 0) {
                repliesHtml += `<div class="reply-list">`;
                repliesArray.forEach((reply) => {
                    repliesHtml += `
                        <div class="reply-item">
                            <div class="reply-meta"><strong>${escapeHtml(reply.authorName || "Crewmate")}</strong> · ${escapeHtml(reply.timeLabel || "Just now")}</div>
                            <div>${escapeHtml(reply.text || "")}</div>
                        </div>
                    `;
                });
                repliesHtml += `</div>`;
            }

            feedContainer.innerHTML += `
                <div class="feed-post">
                    <div class="post-shell">
                        <div class="post-header">
                            <div class="user-avatar">${getInitial(postData.authorName)}</div>
                            <div>
                                <strong>${escapeHtml(postData.authorName || "Unknown")}</strong>
                                <div class="text-muted" style="font-size: 0.85rem;">[${escapeHtml(postData.authorDept || "Crew")}] · ${formatTimestamp(postData.timestamp)}</div>
                                <div class="post-badges">
                                    <span class="post-chip">Mission Broadcast</span>
                                </div>
                            </div>
                        </div>
                        <p class="post-body">${escapeHtml(postData.content || "")}</p>
                        <div class="post-actions">
                            <button class="action-btn ${likeClass}" onclick="toggleLike('${postId}')">♥ Like (${likesArray.length})</button>
                            <button class="action-btn" onclick="toggleReplyBox('${postId}')">↩ Reply (${repliesArray.length})</button>
                            ${deleteButtonHtml}
                        </div>
                        <div class="reply-section hidden" id="replybox-${postId}">
                            <div class="reply-input-row">
                                <input type="text" id="reply-input-${postId}" placeholder="Write a reply..." />
                                <button class="btn-reply" onclick="addReply('${postId}')">Reply</button>
                            </div>
                            ${repliesHtml}
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        console.log(error.message);
        feedContainer.innerHTML = "<p class='empty-state'>Could not load transmissions.</p>";
    }
};

window.toggleReplyBox = function (postId) {
    const replyBox = document.getElementById(`replybox-${postId}`);
    if (!replyBox) return;
    replyBox.classList.toggle("hidden");
};

window.addReply = async function (postId) {
    if (!auth.currentUser || !currentUserData) return;
    const input = document.getElementById(`reply-input-${postId}`);
    const text = input.value.trim();
    if (!text) return;

    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) return;

    const currentReplies = Array.isArray(postSnap.data().replies) ? postSnap.data().replies : [];
    currentReplies.push({
        authorId: auth.currentUser.uid,
        authorName: currentUserData.username,
        text,
        timeLabel: new Date().toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        })
    });

    await updateDoc(postRef, { replies: currentReplies });
    input.value = "";
    loadFeed();
};

window.toggleLike = async function (postId) {
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists() || !auth.currentUser) return;

    let likes = postSnap.data().likes || [];
    const myUid = auth.currentUser.uid;
    if (likes.includes(myUid)) likes = likes.filter((id) => id !== myUid);
    else likes.push(myUid);

    await updateDoc(postRef, { likes });
    loadFeed();
};

window.deletePost = async function (postId) {
    if (!confirm("Are you sure you want to delete this transmission?")) return;
    await deleteDoc(doc(db, "posts", postId));
    loadFeed();
};

window.loadCrewRoster = async function () {
    const crewContainer = document.getElementById("crew-grid-container");
    crewContainer.innerHTML = "<p class='empty-state'>Scanning personnel records...</p>";
    const usersSnapshot = await getDocs(collection(db, "users"));
    crewContainer.innerHTML = "";

    usersSnapshot.forEach((userDocument) => {
        const userData = userDocument.data();
        if (auth.currentUser && userData.uid === auth.currentUser.uid) return;

        const onlineClass = userData.status === "online" ? "dot-online" : "dot-offline";
        const statusText = userData.status === "online" ? "Online" : "Offline";

        crewContainer.innerHTML += `
            <div class="crew-card" onclick="viewOtherProfile('${userData.uid}')">
                <div class="user-avatar crew-card-avatar">${getInitial(userData.username)}</div>
                <h3 style="margin: 0 0 0.4rem;">${escapeHtml(userData.username || "Unknown")}</h3>
                <p class="text-muted" style="margin: 0 0 0.5rem;">${escapeHtml(userData.department || "Crew")}</p>
                <p style="margin: 0;"><span class="status ${onlineClass}"></span>${statusText}</p>
            </div>
        `;
    });

    if (crewContainer.innerHTML.trim() === "") {
        crewContainer.innerHTML = "<p class='empty-state'>No other crew members found yet.</p>";
    }
};

window.loadMyProfile = async function () {
    if (!currentUserData) return;
    document.getElementById("my-username").innerText = currentUserData.username;
    document.getElementById("my-dept").innerText = currentUserData.department;
    document.getElementById("my-bio-display").innerText = currentUserData.bio?.trim() ? currentUserData.bio : "No bio added yet.";
    document.getElementById("edit-username").value = currentUserData.username || "";
    document.getElementById("edit-bio").value = currentUserData.bio || "";

    const friendsContainer = document.getElementById("my-friends-container");
    const myFriends = Array.isArray(currentUserData.friends) ? currentUserData.friends : [];

    if (myFriends.length === 0) {
        friendsContainer.innerHTML = "<p class='empty-state'>No contacts added yet. Browse the crew roster.</p>";
        return;
    }

    friendsContainer.innerHTML = "";
    const usersSnapshot = await getDocs(collection(db, "users"));

    usersSnapshot.forEach((userDocument) => {
        const userData = userDocument.data();
        if (!myFriends.includes(userData.uid)) return;

        friendsContainer.innerHTML += `
            <div class="crew-card" onclick="viewOtherProfile('${userData.uid}')">
                <div class="user-avatar crew-card-avatar">${getInitial(userData.username)}</div>
                <h3 style="margin: 0 0 0.4rem;">${escapeHtml(userData.username || "Unknown")}</h3>
                <p class="text-muted" style="margin: 0;">${escapeHtml(userData.department || "Crew")}</p>
            </div>
        `;
    });

    if (friendsContainer.innerHTML.trim() === "") {
        friendsContainer.innerHTML = "<p class='empty-state'>No contacts added yet. Browse the crew roster.</p>";
    }
};

window.saveProfileEdits = async function () {
    if (!auth.currentUser || !currentUserData) return;

    const newUsername = document.getElementById("edit-username").value.trim();
    const newBio = document.getElementById("edit-bio").value.trim();

    if (!newUsername) {
        alert("Username cannot be empty.");
        return;
    }

    await updateDoc(doc(db, "users", auth.currentUser.uid), {
        username: newUsername,
        bio: newBio
    });

    currentUserData.username = newUsername;
    currentUserData.bio = newBio;
    loadMyProfile();
};

window.viewOtherProfile = async function (uid) {
    viewingUserId = uid;
    switchPage("other-profile");
    const userSnap = await getDoc(doc(db, "users", uid));
    if (!userSnap.exists()) return;

    const userData = userSnap.data();
    document.getElementById("other-username").innerText = userData.username;
    document.getElementById("other-dept").innerText = userData.department;
    document.getElementById("other-bio-display").innerText = userData.bio?.trim() ? userData.bio : "No bio available.";

    const isOnline = userData.status === "online";
    document.getElementById("other-status").className = "status " + (isOnline ? "dot-online" : "dot-offline");
    document.getElementById("other-status-text").innerText = isOnline ? "Online" : "Offline";
    document.getElementById("other-status-text").className = isOnline ? "text-online" : "text-muted";

    const myFriends = Array.isArray(currentUserData?.friends) ? currentUserData.friends : [];
    const friendButton = document.getElementById("friend-btn");

    if (myFriends.includes(uid)) {
        friendButton.innerText = "✓ Remove Contact";
        friendButton.classList.add("contact-added");
    } else {
        friendButton.innerText = "+ Add to Contacts";
        friendButton.classList.remove("contact-added");
    }
};

window.toggleFriend = async function () {
    if (!viewingUserId || !auth.currentUser || !currentUserData) return;
    let myFriends = Array.isArray(currentUserData.friends) ? currentUserData.friends : [];

    if (myFriends.includes(viewingUserId)) myFriends = myFriends.filter((id) => id !== viewingUserId);
    else myFriends.push(viewingUserId);

    await updateDoc(doc(db, "users", auth.currentUser.uid), { friends: myFriends });
    currentUserData.friends = myFriends;

    const friendButton = document.getElementById("friend-btn");
    if (myFriends.includes(viewingUserId)) {
        friendButton.innerText = "✓ Remove Contact";
        friendButton.classList.add("contact-added");
    } else {
        friendButton.innerText = "+ Add to Contacts";
        friendButton.classList.remove("contact-added");
    }
};

window.openChat = async function () {
    if (!viewingUserId || !auth.currentUser) return;
    switchPage("chat-page");

    const myUid = auth.currentUser.uid;
    const otherUid = viewingUserId;
    const chatId = getChatId(myUid, otherUid);
    document.getElementById("chat-title").innerText = "Secure Comm: " + document.getElementById("other-username").innerText;

    const chatHistory = document.getElementById("chat-history");
    chatHistory.innerHTML = "<p class='empty-state'>Securing connection...</p>";
    stopChatListener();

    const messageQuery = query(collection(db, "messages"), where("chatId", "==", chatId));

    currentChatUnsubscribe = onSnapshot(messageQuery, (snapshot) => {
        const messages = [];
        snapshot.forEach((docItem) => messages.push(docItem.data()));
        messages.sort((a, b) => (a.timestamp?.toMillis ? a.timestamp.toMillis() : 0) - (b.timestamp?.toMillis ? b.timestamp.toMillis() : 0));

        chatHistory.innerHTML = "";
        if (messages.length === 0) {
            chatHistory.innerHTML = "<p class='empty-state'>No messages yet. Send a transmission.</p>";
            return;
        }

        messages.forEach((message) => {
            const bubbleClass = message.senderId === myUid ? "bubble-sent" : "bubble-received";
            chatHistory.innerHTML += `<div class="chat-bubble ${bubbleClass}">${escapeHtml(message.text)}</div>`;
        });
        chatHistory.scrollTop = chatHistory.scrollHeight;
    });
};

window.sendChatMessage = async function () {
    const chatInput = document.getElementById("chat-input");
    const text = chatInput.value.trim();
    if (!text || !auth.currentUser || !viewingUserId) return;

    const myUid = auth.currentUser.uid;
    const otherUid = viewingUserId;
    chatInput.value = "";

    await addDoc(collection(db, "messages"), {
        chatId: getChatId(myUid, otherUid),
        senderId: myUid,
        text,
        participants: [myUid, otherUid],
        timestamp: serverTimestamp()
    });
};

document.getElementById("chat-input").addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        sendChatMessage();
    }
});
