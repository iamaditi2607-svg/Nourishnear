let needs = [];
let activeFeed = "needs";
let activeNeedId = null;
let pendingCoordinates = null;
let donorCoordinates = null;
let conversationHistory = [];
let mapInstance = null;
let mapMarkerLayer = null;
let mapViewPosts = [];
const originalRenderListings = renderListings;
const originalNavigate = navigate;
const originalRenderDonations = renderDonations;

function distanceBetween(first, second) {
  const radians = degrees => degrees * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const latitude = radians(first.latitude);
  const otherLatitude = radians(second.latitude);
  const earthRadiusKm = 6371;
  const arc = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitude) * Math.cos(otherLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

function distanceForNeed(item) {
  if (donorCoordinates && item.coordinates) return `${distanceBetween(donorCoordinates, item.coordinates).toFixed(1)} km`;
  if (donorCoordinates && item.mapCoordinates) return `≈ ${distanceBetween(donorCoordinates, item.mapCoordinates).toFixed(1)} km (area)`;
  return "area shown on map";
}

function coordinatesFor(item) {
  if (item.mapCoordinates) return item.mapCoordinates;
  if (Number.isFinite(item.latitude) && Number.isFinite(item.longitude)) {
    return { latitude: item.latitude, longitude: item.longitude };
  }
  return null;
}

function inUttarPradesh(item) {
  return /uttar pradesh/i.test(item.location || "");
}

function areaMapHref(location) {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(location)}`;
}

function renderMapPostsList() {
  const visiblePosts = mapInstance
    ? mapViewPosts.filter(({ item }) => {
      const coordinates = coordinatesFor(item);
      return coordinates && mapInstance.getBounds().contains([coordinates.latitude, coordinates.longitude]);
    })
    : mapViewPosts;
  const requests = visiblePosts.filter(post => post.kind === "need");
  const foods = visiblePosts.filter(post => post.kind === "food");
  $("#map-summary").innerHTML = `<span><strong>${requests.length}</strong> food requests in this map area</span><span><strong>${foods.length}</strong> food listings in this map area</span><span><strong>${new Set(visiblePosts.map(({ item }) => item.location)).size}</strong> mapped areas</span>`;
  $("#map-posts-list").innerHTML = visiblePosts.length
    ? visiblePosts.map(({ item, kind }) => {
      const label = kind === "need" ? `${item.people} people need food` : `${item.quantity} ${item.unit} available`;
      const action = kind === "need"
        ? `<button class="button button-primary map-focus-button" data-help-need="${esc(item.id)}">Offer food</button>`
        : `<button class="button button-primary map-focus-button" data-map-food="${esc(item.id)}">View food</button>`;
      return `<article class="list-row map-post-row"><span class="request-row-icon ${kind === "need" ? "map-need-icon" : "map-food-icon"}">${kind === "need" ? "♡" : "♧"}</span><div class="list-row-main"><strong>${esc(kind === "need" ? item.meal : item.title)}${item.demo ? " · DEMO SAMPLE" : ""}</strong><span>${esc(item.location)} · ${esc(label)}</span></div><div class="map-post-actions"><button class="button button-outline map-focus-button" data-map-focus="${esc(item.id)}" data-map-kind="${kind}">Show on map</button>${action}</div></article>`;
    }).join("")
    : `<div class="list-empty">No posted food needs or donations are visible in this map area. Search another place or zoom out to explore farther.</div>`;
}

function renderMapMarkers() {
  const needsMode = activeFeed === "needs";
  const posts = needsMode ? filteredNeeds() : filteredListings();
  $("#map-title").textContent = needsMode ? "People needing food" : "Food available nearby";
  $("#nearby-summary-text").textContent = needsMode ? "people need food nearby" : "food posts nearby";
  $("#nearby-count").textContent = posts.length;
  $("#request-map-pins").innerHTML = posts.slice(0, 4).map((item, index) => {
    const pin = ["pin-one", "pin-two", "pin-three", "pin-four"][index];
    if (needsMode) return `<button class="map-pin ${pin} need-map-pin" type="button" data-map-need="${esc(item.id)}" title="${esc(item.recipient)} · ${esc(item.location)}" aria-label="Open ${esc(item.recipient)}’s location map">${esc(item.initials)}</button>`;
    const icon = { Meals: "🍱", Produce: "🥬", Bakery: "🥐", Dairy: "🥛" }[item.category] || "✦";
    return `<button class="map-pin ${pin} food-map-pin" type="button" data-map-food="${esc(item.id)}" title="${esc(item.title)} · ${esc(item.location)}" aria-label="View ${esc(item.title)}">${icon}</button>`;
  }).join("");
}

function updateFeedLabels() {
  const needsMode = activeFeed === "needs";
  const resultCount = needsMode ? filteredNeeds().length : filteredListings().length;
  const resultLabel = needsMode
    ? `${resultCount} ${resultCount === 1 ? "request" : "requests"}`
    : `${resultCount} ${resultCount === 1 ? "find" : "finds"}`;
  $("#food-categories").classList.toggle("hidden", needsMode);
  $("#feed-title").innerHTML = needsMode
    ? `Neighbors looking for a little help <span class="result-count" id="result-count">${resultLabel}</span>`
    : `Food on the table near you <span class="result-count" id="result-count">${resultLabel}</span>`;
  $("#feed-description").textContent = needsMode
    ? "Offer a meal to someone nearby who could use one today."
    : "Fresh finds from neighbors, restaurants, and local kitchens.";
  $("#sort-select").setAttribute("aria-label", needsMode ? "Sort nearby requests" : "Sort nearby food");
  $("#needs-tab-count").textContent = needs.filter(item => item.status === "open").length;
  $("#food-tab-count").textContent = available().length;
  $("#impact-meals").textContent = listings.filter(item => !item.demo).length;
  $("#impact-active").textContent = available().filter(item => !item.demo).length;
  $("#impact-needs").textContent = needs.filter(item => item.status === "open" && !item.demo).length;
  document.querySelectorAll(".feed-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.feed === activeFeed));
}

function filteredNeeds() {
  const query = $("#search-input").value.trim().toLowerCase();
  const location = $("#location-input").value.trim().toLowerCase().replace(/,\s*india$/, "");
  const statewideSearch = ["uttar pradesh", "up", "uttar pradesh, india"].includes(location);
  const matches = needs.filter(item => {
    const text = `${item.meal} ${item.details} ${item.location} ${item.recipient}`.toLowerCase();
    const locationMatch = !location || (statewideSearch
      ? inUttarPradesh(item)
      : item.location.toLowerCase().includes(location));
    return item.status === "open" && (!query || text.includes(query)) && locationMatch;
  });
  if ($("#sort-select").value === "newest") matches.sort((a, b) => b.createdAt - a.createdAt);
  else if ($("#sort-select").value === "quantity") matches.sort((a, b) => b.people - a.people);
  else matches.sort((a, b) => {
    const firstCoordinates = coordinatesFor(a);
    const secondCoordinates = coordinatesFor(b);
    if (donorCoordinates && firstCoordinates && secondCoordinates) {
      return distanceBetween(donorCoordinates, firstCoordinates) - distanceBetween(donorCoordinates, secondCoordinates);
    }
    return b.createdAt - a.createdAt;
  });
  return matches;
}

function needCard(item) {
  return `<article class="need-card"><div class="need-card-top"><span class="need-avatar">${esc(item.initials)}</span><div class="need-person"><strong>${esc(item.recipient)}${item.demo ? " · DEMO" : ""}</strong><span>${esc(item.requesterType || "Home / family")}</span></div><span class="need-distance">⌖ ${esc(distanceForNeed(item))}</span></div><div class="need-card-content"><span class="need-label">LOOKING FOR</span><h3>${esc(item.meal)}</h3><p>${esc(item.details)}</p></div><div class="need-card-meta"><span>♧ ${esc(item.people)} people</span><span>⌖ ${esc(item.location)}</span><span>↗ ${esc(item.fulfilment)}</span></div><div class="need-card-actions"><a class="map-area-link" href="${areaMapHref(item.location)}" target="_blank" rel="noopener noreferrer">⌖ View area map</a><button class="button button-primary help-button" data-help-need="${esc(item.id)}">I can help <span>→</span></button></div></article>`;
}

function renderNeeds() {
  const results = filteredNeeds();
  $("#food-grid").innerHTML = results.map(needCard).join("");
  $("#food-grid").classList.toggle("hidden", results.length === 0);
  $("#empty-state").classList.toggle("hidden", results.length > 0);
  if (!results.length) {
    $("#empty-state").querySelector("h3").textContent = "No open food requests nearby";
    $("#empty-state").querySelector("p").textContent = "Try another neighborhood or check back soon. You can also share surplus food with the community.";
  } else {
    $("#empty-state").querySelector("h3").textContent = "No food found just yet";
    $("#empty-state").querySelector("p").textContent = "Try another search or check back soon—good things are always cooking.";
  }
  $("#result-count").textContent = `${results.length} ${results.length === 1 ? "request" : "requests"}`;
  updateFeedLabels();
  renderMapMarkers();
  renderCounts();
}

renderListings = function () {
  if (activeFeed === "needs") renderNeeds();
  else {
    originalRenderListings();
    updateFeedLabels();
    renderMapMarkers();
  }
};

navigate = function (page) {
  originalNavigate(page);
  if (page === "discover") renderListings();
  if (page === "food-map") renderFoodMap();
  if (page === "my-requests") renderMyRequests();
  if (page === "my-donations") renderDonations();
  if (page === "my-pickups") renderPickups();
  $("#breadcrumb-page").textContent = ({
    discover: "Discover food",
    "food-map": "Community food map",
    "my-donations": "My donations",
    "my-requests": "My food requests",
    "my-pickups": "My pickups"
  })[page] || "Community";
};

renderDonations = function () {
  originalRenderDonations();
  const own = listings.filter(item => item.isMine).slice().reverse();
  document.querySelectorAll("#donation-list .list-row").forEach((row, index) => {
    const item = own[index];
    if (!item || !item.recipientCoordinates || !["matched", "delivered"].includes(item.status)) return;
    const { latitude, longitude } = item.recipientCoordinates;
    const mapLink = document.createElement("a");
    mapLink.className = "recipient-map-link";
    mapLink.href = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
    mapLink.target = "_blank";
    mapLink.rel = "noopener noreferrer";
    mapLink.textContent = "Open recipient pin · shared with you";
    row.querySelector(".list-row-main").append(mapLink);
  });
};

function openNeedForm(draft = {}) {
  pendingCoordinates = null;
  showModal(`<span class="modal-kicker">ASK YOUR NEIGHBORHOOD</span><h2 id="modal-title">Ask for a meal.</h2><p class="modal-copy">Share what would help and your neighborhood. Nearby food sharers can offer to help.</p>
    <form id="need-form"><div class="form-grid">
      <div class="form-field full"><label for="need-type">Who needs food? *</label><select id="need-type" name="requesterType"><option>Home / family</option><option>Individual</option><option>Shelter / community centre</option><option>Community kitchen / NGO</option><option>Other</option></select></div>
      <div class="form-field full"><label for="need-meal">What kind of food would help? *</label><input id="need-meal" name="meal" maxlength="65" required value="${esc(draft.meal || "")}" placeholder="e.g. Vegetarian dinner for my family"></div>
      <div class="form-field"><label for="need-people">How many people? *</label><input id="need-people" name="people" type="number" min="1" max="30" required value="${Number(draft.people) || 1}"></div>
      <div class="form-field"><label for="need-fulfilment">How can you receive it? *</label><select id="need-fulfilment" name="fulfilment"><option ${draft.fulfilment === "Delivery preferred" ? "selected" : ""}>Delivery preferred</option><option ${draft.fulfilment === "Pickup works" ? "selected" : ""}>Pickup works</option><option>Either works</option></select></div>
      <div class="form-field full"><label for="need-location">Your city or area *</label><div class="location-input-row"><input id="need-location" name="location" required maxlength="75" value="${esc(draft.location || "")}" placeholder="e.g. Gomti Nagar, Lucknow or Paris, France"><button class="button button-outline" id="use-location" type="button">⌖ Use my location</button></div></div>
      <div class="form-field full location-consent"><label><input id="share-exact" name="shareExact" type="checkbox"> Share my precise map pin with the neighbor who offers help</label><span id="location-status">You can also just share your neighborhood. Exact location is optional.</span></div>
      <div class="form-field full"><label for="need-details">Anything else they should know? (optional)</label><textarea id="need-details" name="details" maxlength="220" placeholder="Dietary needs, a helpful landmark, or a safe way to hand over the food...">${esc(draft.details || "")}</textarea></div>
    </div><button class="button button-primary modal-submit" type="submit">Post my food request <span>→</span></button></form>`);
}

function openOfferForm(needId) {
  const request = needs.find(item => item.id === needId && item.status === "open");
  if (!request) return toast("This neighbor has already received an offer.");
  activeNeedId = request.id;
  showModal(`<span class="modal-kicker">A NEIGHBOR COULD USE YOUR HELP</span><h2 id="modal-title">Offer a meal.</h2><p class="modal-copy">Your offer is for ${esc(request.recipient)} in ${esc(request.location)}, looking for food for ${esc(request.people)} people.</p>
    <form id="offer-form"><div class="form-grid">
      <div class="form-field full"><label for="offer-title">What food can you share? *</label><input id="offer-title" name="title" required maxlength="55" placeholder="e.g. Fresh vegetable khichdi"></div>
      <div class="form-field"><label for="offer-category">Food category *</label><select id="offer-category" name="category"><option>Meals</option><option>Produce</option><option>Bakery</option><option>Dairy</option><option>Other</option></select></div>
      <div class="form-field full"><label for="offer-source">Where is the food from? *</label><select id="offer-source" name="source"><option>Home / household</option><option>Restaurant / cafe</option><option>Wedding / marriage function</option><option>Birthday / party</option><option>Community event / festival</option><option>Office / school event</option><option>Hotel / caterer</option><option>Community kitchen / NGO</option><option>Other</option></select></div>
      <div class="form-field"><label for="offer-quantity">Portions available *</label><input id="offer-quantity" name="quantity" type="number" min="1" max="500" value="${Math.max(1, Number(request.people))}" required></div>
      <div class="form-field"><label for="offer-pickup">Ready by / pickup time *</label><input id="offer-pickup" name="pickup" required placeholder="Today, 6:00–8:00 PM"></div>
      <div class="form-field"><label for="offer-location">Your city or area *</label><input id="offer-location" name="location" required maxlength="70" placeholder="e.g. Lucknow, India or Paris, France"></div>
      <div class="form-field full"><label for="offer-details">Helpful food or handover details (optional)</label><textarea id="offer-details" name="description" maxlength="220" placeholder="Ingredients, storage, and how to arrange delivery or pickup"></textarea></div>
    </div><button class="button button-primary modal-submit" type="submit">Offer this food to ${esc(request.recipient)} <span>→</span></button></form>`);
}

function renderMyRequests() {
  const own = needs.filter(item => item.isMine);
  const open = own.filter(item => item.status === "open").length;
  const matched = own.filter(item => item.status === "matched").length;
  const delivered = own.filter(item => item.status === "delivered").length;
  $("#request-summary").innerHTML = `<div class="summary-card"><span>REQUESTS SHARED</span><strong>${own.length}</strong></div><div class="summary-card"><span>NEIGHBORS OFFERING HELP</span><strong>${matched}</strong></div><div class="summary-card"><span>FOOD RECEIVED</span><strong>${delivered}</strong></div>`;
  $("#request-list").innerHTML = own.length ? own.slice().reverse().map(item => `<article class="list-row"><span class="request-row-icon">${item.status === "delivered" ? "✓" : item.status === "matched" ? "♡" : "⌕"}</span><div class="list-row-main"><strong>${esc(item.meal)} · ${esc(item.people)} people</strong><span>${esc(item.location)} · ${esc(item.fulfilment)}${item.status === "matched" ? ` · Offered by ${esc(item.matchedBy)}` : ""}</span></div><span class="status-pill ${item.status === "open" ? "active" : item.status === "matched" ? "matched" : "delivered"}">${item.status === "open" ? "Looking for help" : item.status === "matched" ? "Food offered" : "Received"}</span>${item.status === "matched" ? `<button class="button button-outline received-button" data-mark-received="${esc(item.id)}">Mark received</button>` : ""}</article>`).join("") : `<div class="list-empty">No food requests yet. Ask Nourish AI for help finding a meal near you.<br><button class="button button-primary" style="margin-top:12px" data-open-need>＋ Ask for food</button></div>`;
}

function beginVoiceRequest() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return toast("Voice input is not available in this browser. Type your request instead.");
  const button = $("#voice-request");
  const status = $("#voice-status");
  const recognition = new Recognition();
  recognition.lang = "hi-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  button.classList.add("listening");
  status.textContent = "Listening… say what you need and your neighborhood.";
  recognition.onresult = event => {
    $("#need-prompt").value = event.results[0][0].transcript;
    status.textContent = "Got it. Review your words before sharing your request.";
  };
  recognition.onerror = event => {
    status.textContent = "Voice input stopped. You can type your request instead.";
    toast(event.error === "not-allowed" ? "Please allow microphone access to use voice input." : "Voice input could not start. Please try typing.");
  };
  recognition.onend = () => button.classList.remove("listening");
  try { recognition.start(); }
  catch (error) {
    button.classList.remove("listening");
    console.error("Could not start browser speech recognition.", error);
    toast("Voice input could not start. Please try again or type your request.");
  }
}

function renderFoodMap() {
  if (!window.L) {
    toast("The interactive map could not load. Check your internet connection and refresh.");
    return;
  }
  if (!mapInstance) {
    mapInstance = window.L.map("up-food-map").setView([27.1, 80.4], 6);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
    }).addTo(mapInstance);
    mapMarkerLayer = window.L.layerGroup().addTo(mapInstance);
    mapInstance.on("moveend", renderMapPostsList);
  }
  window.setTimeout(() => mapInstance.invalidateSize(), 100);
  const filter = $("#map-filter").value;
  const foods = listings.filter(item => item.status === "available");
  const requests = needs.filter(item => item.status === "open");
  const posts = [
    ...(filter !== "needs" ? foods.map(item => ({ item, kind: "food" })) : []),
    ...(filter !== "food" ? requests.map(item => ({ item, kind: "need" })) : [])
  ];
  mapViewPosts = posts;
  mapMarkerLayer.clearLayers();
  for (const post of posts) {
    const { item, kind } = post;
    const coordinates = coordinatesFor(item);
    if (!coordinates) continue;
    const color = kind === "need" ? "#bd654b" : "#477b55";
    const title = kind === "need" ? item.meal : item.title;
    const detail = kind === "need" ? `${item.people} people need food` : `${item.quantity} ${item.unit} available`;
    const marker = window.L.circleMarker([coordinates.latitude, coordinates.longitude], {
      radius: item.demo ? 8 : 10,
      color,
      fillColor: color,
      fillOpacity: 0.82,
      weight: 2
    });
    marker.bindPopup(
      `<strong>${esc(kind === "need" ? "FOOD NEEDED" : "FOOD AVAILABLE")}${item.demo ? " · DEMO" : ""}</strong>` +
      `<br>${esc(title)}<br>${esc(detail)}<br>${esc(item.location)}`
    );
    marker.addTo(mapMarkerLayer);
  }
  renderMapPostsList();
}

function useCurrentLocation() {
  if (!navigator.geolocation) return toast("Location access is not available in this browser.");
  $("#location-status").textContent = "Waiting for your permission…";
  try {
    navigator.geolocation.getCurrentPosition(
      position => {
        pendingCoordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        $("#need-location").value = $("#need-location").value || "";
        $("#location-status").textContent = "GPS ready. Enter your city/area. Your precise pin is shared only if you tick the consent box.";
      },
      error => {
        $("#location-status").textContent = "Location unavailable. Enter your neighborhood instead.";
        toast(error.code === error.PERMISSION_DENIED ? "Location permission was declined. Enter your neighborhood manually." : "Could not get your location. Please enter your neighborhood.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  } catch (error) {
    $("#location-status").textContent = "Location unavailable. Enter your neighborhood instead.";
    console.error("Could not request the browser location.", error);
    toast("Location access is unavailable here. Enter your neighborhood manually.");
  }
}

function locateDonor() {
  if (!navigator.geolocation) return toast("Location access is not available in this browser.");
  toast("Waiting for your permission to use your location.");
  try {
    navigator.geolocation.getCurrentPosition(
      position => {
        donorCoordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        $("#location-input").value = "";
        renderListings();
        toast("Showing posts closest to your current location. Your GPS location is not shared.");
      },
      error => toast(error.code === error.PERMISSION_DENIED ? "Location permission was declined. Search by neighborhood instead." : "Could not get your location. Search by neighborhood instead."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  } catch (error) {
    console.error("Could not request the browser location.", error);
    toast("Location access is unavailable here. Search by neighborhood instead.");
  }
}

function appendAssistantMessage(role, text, sources = []) {
  const chat = $("#assistant-chat");
  const message = document.createElement("div");
  message.className = `assistant-message ${role}`;
  message.textContent = text;
  chat.append(message);
  if (sources.length) {
    const sourceList = document.createElement("div");
    sourceList.className = "assistant-sources";
    const label = document.createElement("span");
    label.textContent = "Sources:";
    sourceList.append(label);
    for (const source of sources) {
      if (!source.url.startsWith("https://")) continue;
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = source.title || new URL(source.url).hostname;
      sourceList.append(link);
    }
    if (sourceList.querySelector("a")) chat.append(sourceList);
  }
  chat.classList.remove("hidden");
  chat.scrollTop = chat.scrollHeight;
  return message;
}

function generateLocalAiResponse(prompt, userLocation) {
  const query = prompt.toLowerCase();
  const loc = (userLocation || "").toLowerCase();
  const availableFoods = listings.filter(i => i.status === "available");

  // 1. Check for greeting
  if (/^(hi|hello|hey|namaste|pranam|namaskar|salaam|good\s*(morning|evening|afternoon)|kaise ho)\b/i.test(query.trim())) {
    return `Namaste! 🙏 Main Nourish AI hoon. Main aapke aas-paas ka bhojan dhoondhne, surplus khana share karne, aur food requests post karne mein madad kar sakta hoon.\n\nAap pooch sakte hain—jaise "Lucknow mein kya khana available hai?", "Bhojan donate kaise karein?", ya "Food request kaise post karein?".`;
  }

  // 2. Check for food donation / share help
  if (/(donate|share|daan|bhojan dena|bacha hua|leftover|wedding|shadi|party|cater)/i.test(query)) {
    return `NourishNear par bhojan share karna bahut aasan hai:\n\n1. Upar "＋ Share food" ya "Donate food" button par click karein.\n2. Bhojan ka naam, category (Meals, Produce, Bakery, Dairy), aur quantity batayein.\n3. Pickup ka samay aur apna area/shehar darj karein (photo upload karna optional hai).\n4. Post karte hi aapki listing community map aur feed par dikhne lagegi taaki zarooratmand neighbor use reserve kar sakein.\n\nKisi bhi extra home-cooked ya function ke khane ko zaya hone se bachayein! ❤️`;
  }

  // 3. Check for food request / asking help
  if (/(need food|bhukh|madad|request|bhojan chahiye|khana chahiye|help me with food)/i.test(query)) {
    return `Agar aapko ya kisi parivaar ko bhojan ki zaroorat hai:\n\n1. "＋ Ask for food" par click karke apni request post karein (kitne logon ke liye chahiye, delivery ya pickup, aur aapka area).\n2. Ya fir "Food available nearby" tab par jakar kisi bhi uplabdh listing par "View & request" daba kar pickup reserve karein.\n\nCommunity ke donors aur helpers jald hi aapki request par offer bhejenge!`;
  }

  // 4. Check for food safety / storage
  if (/(safe|safety|hygiene|store|storage|fridge|kharaab|expire|baasi)/i.test(query)) {
    return `Bhojan ki suraksha (Food Safety) ke zaroori niyam:\n\n• Cooked Food: Pakne ke 2 ghante ke bheetar serve karein ya 4°C se kam taapmaan par fridge mein rakhein.\n• Clean Packaging: Bhojan ko saaf, air-tight dabbo ya foil mein pack karein.\n• Quality Check: Handover se pehle khushboo, rang aur freshness zaroor jaanch lein.\n• Timely Pickup: Pickup window ke bheetar hi khana share karein taaki taazgi bani rahe.`;
  }

  // 5. Query matching listings or location
  const matchingFoods = availableFoods.filter(item => {
    const text = `${item.title} ${item.description} ${item.category} ${item.location}`.toLowerCase();
    const words = query.split(/\s+/).filter(w => w.length > 2);
    const matchesWord = words.some(w => text.includes(w));
    const matchesLoc = loc && text.includes(loc);
    return matchesWord || matchesLoc;
  });

  if (matchingFoods.length > 0) {
    const itemsText = matchingFoods.slice(0, 4).map(item =>
      `• ${item.title} (${item.quantity} ${item.unit}) — 📍 ${item.location} [Pickup: ${item.pickup}]`
    ).join("\n");
    return `Aapki search ke anusaar yeh bhojan uplabdh hai:\n\n${itemsText}\n\nAap food card par jakar "View & request" par click karke turant servings reserve kar sakte hain!`;
  }

  // 6. Generic food search fallback
  if (/(khana|food|meal|dinner|lunch|breakfast|dal|rice|sabzi|roti|veggie|bread|milk|fruits)/i.test(query)) {
    if (availableFoods.length > 0) {
      const topItems = availableFoods.slice(0, 3).map(item =>
        `• ${item.title} (${item.quantity} ${item.unit}) — 📍 ${item.location}`
      ).join("\n");
      return `Community mein filhaal yeh food listings uplabdh hain:\n\n${topItems}\n\nAap aur dekhne ke liye "Food available nearby" tab ya "Community food map" par ja sakte hain.`;
    }
    return `Filhaal is area ke liye koi open food listing nahi mili. Aap "Ask for food" par click karke apni zaroorat post kar sakte hain taaki aas-paas ke neighbors aapki madad kar sakein.`;
  }

  // 7. General inquiry response
  return `Aapka sawaal: "${prompt}"\n\nNourishNear ek community food-sharing platform hai jahan par bacha hua taaza bhojan share kiya jata hai aur zarooratmand log bhojan prapt kar sakte hain.\n\nAap aas-paas ke uplabdh bhojan ke baare mein pooch sakte hain, ya map explore kar sakte hain.\n\n(💡 Live AI chat ke liye server ki .env file mein apni free Groq API key add karein: console.groq.com/keys)`;
}

async function askNourishAi() {
  const input = $("#need-prompt");
  const prompt = input.value.trim();
  if (!prompt) return toast("Ask Nourish AI about nearby food, a neighborhood, or a meal idea.");
  input.value = "";
  appendAssistantMessage("user", prompt);
  const pending = appendAssistantMessage("assistant pending", "Soch raha hoon… / Thinking…");
  $("#ask-assistant").disabled = true;
  try {
    const result = await nourishApi.askAssistant({
      prompt,
      location: $("#location-input") ? $("#location-input").value.trim() : "",
      history: conversationHistory.slice(-8)
    });
    pending.textContent = result.reply;
    pending.classList.remove("pending");
    if (result.sources && result.sources.length) {
      const sourceList = document.createElement("div");
      sourceList.className = "assistant-sources";
      const label = document.createElement("span");
      label.textContent = "Sources:";
      sourceList.append(label);
      for (const source of result.sources) {
        if (!source.url.startsWith("https://")) continue;
        const link = document.createElement("a");
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = source.title || new URL(source.url).hostname;
        sourceList.append(link);
      }
      if (sourceList.querySelector("a")) pending.after(sourceList);
    }
    conversationHistory.push({ role: "user", text: prompt }, { role: "assistant", text: result.reply });
    conversationHistory = conversationHistory.slice(-8);
  } catch (error) {
    pending.remove();
    if (error.message && (error.message.includes("GROQ_API_KEY") || error.message.includes("AI setup") || error.message.includes("503") || error.message.includes("busy") || error.message.includes("temporarily"))) {
      const fallbackReply = generateLocalAiResponse(prompt, $("#location-input") ? $("#location-input").value.trim() : "");
      appendAssistantMessage("assistant", fallbackReply);
      conversationHistory.push({ role: "user", text: prompt }, { role: "assistant", text: fallbackReply });
    } else {
      appendAssistantMessage("assistant error", error.message);
    }
  } finally {
    $("#ask-assistant").disabled = false;
  }
}

document.addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.feed) {
    activeFeed = button.dataset.feed;
    renderListings();
  }
  if (button.hasAttribute("data-open-need") || button.id === "open-need-form") openNeedForm();
  if (button.dataset.helpNeed) openOfferForm(button.dataset.helpNeed);
  if (button.dataset.mapNeed) {
  const request = needs.find(item => item.id === button.dataset.mapNeed);
  if (request) window.open(areaMapHref(request.location), "_blank", "noopener,noreferrer");
  }
  if (button.dataset.mapFood) openDetails(button.dataset.mapFood);
  if (button.id === "voice-request") beginVoiceRequest();
  if (button.id === "ask-assistant") await askNourishAi();
  if (button.id === "use-location") useCurrentLocation();
  if (button.id === "locate-donor") locateDonor();
  if (button.id === "map-search") {
    const location = $("#map-location-input").value.trim();
    if (!location) return toast("Enter a city, area, or country.");
    try {
      const result = await nourishApi.geocode(location);
      mapInstance.setView([result.location.latitude, result.location.longitude], result.location.zoom || 13);
      toast(`Showing ${location} on the community map.`);
    } catch (error) {
      toast(error.message);
    }
  }
  if (button.id === "map-my-location") {
    if (!navigator.geolocation) return toast("Location access is not available in this browser.");
    navigator.geolocation.getCurrentPosition(
      position => {
        mapInstance.setView([position.coords.latitude, position.coords.longitude], 14);
        toast("Map centered on your current location. Your location was not shared with the server.");
      },
      error => toast(error.code === error.PERMISSION_DENIED ? "Location permission was declined." : "Could not get your location. Search a city or district instead."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }
  if (button.dataset.mapFocus) {
    const items = button.dataset.mapKind === "need" ? needs : listings;
    const item = items.find(entry => entry.id === button.dataset.mapFocus);
    const coordinates = item && coordinatesFor(item);
    if (coordinates) {
      mapInstance.setView([coordinates.latitude, coordinates.longitude], 14);
      mapMarkerLayer.eachLayer(marker => {
        const point = marker.getLatLng();
        if (point.lat === coordinates.latitude && point.lng === coordinates.longitude) marker.openPopup();
      });
    }
  }
  if (button.dataset.markReceived) {
    const request = needs.find(item => item.id === button.dataset.markReceived && item.status === "matched" && item.isMine);
    if (!request) return toast("This request is no longer waiting for a food handover.");
    try {
      await nourishApi.markReceived(request.id);
      request.status = "delivered";
      const offer = listings.find(item => item.id === request.offerId);
      if (offer) offer.status = "delivered";
      renderMyRequests();
      renderCounts();
      toast("Marked as received. Thank you for closing the loop!");
    } catch (error) {
      toast(error.message);
    }
  }
});

document.addEventListener("submit", async event => {
  if (event.target.id === "need-form") {
    event.preventDefault();
    const form = new FormData(event.target);
    const exactAllowed = form.get("shareExact") === "on" && pendingCoordinates;
    const submission = {
      requesterType: String(form.get("requesterType")), people: Number(form.get("people")),
      meal: String(form.get("meal")).trim(), details: String(form.get("details")).trim() || "A neighbor is looking for help with a meal.",
      location: String(form.get("location")).trim(), fulfilment: String(form.get("fulfilment")),
      coordinates: exactAllowed ? pendingCoordinates : null
    };
    try {
      const { need } = await nourishApi.createNeed(submission);
      needs.push(need);
      closeModal();
      activeFeed = "needs";
      renderListings();
      toast("Your request is shared with nearby food sharers.");
    } catch (error) {
      toast(error.message);
    }
  }
  if (event.target.id === "offer-form") {
    event.preventDefault();
    const request = needs.find(item => item.id === activeNeedId && item.status === "open");
    if (!request) { closeModal(); renderListings(); return toast("This request already has a food offer."); }
    const form = new FormData(event.target);
    const category = String(form.get("category"));
    const submission = {
      needId: request.id, title: String(form.get("title")).trim(), category, quantity: Number(form.get("quantity")),
      location: String(form.get("location")).trim(),
      pickup: String(form.get("pickup")).trim(), source: String(form.get("source")), donor: "Aditi Sharma", initials: "A",
      description: String(form.get("description")).trim() || `Offered to help ${request.recipient} with their food request.`,
      image: category === "Produce" ? seedListings[1].image : category === "Bakery" ? seedListings[2].image : category === "Dairy" ? seedListings[4].image : seedListings[0].image,
    };
    try {
      const result = await nourishApi.createOffer(submission);
      listings.push(result.listing);
      Object.assign(request, result.need);
      closeModal();
      renderListings();
      renderCounts();
      toast(`Your offer was matched with ${request.recipient}. Please arrange the handover.`);
    } catch (error) {
      toast(error.message);
    }
  }
});

const previousRenderCounts = renderCounts;
renderCounts = function () {
  previousRenderCounts();
  const reqEl = $("#request-count");
  if (reqEl) reqEl.textContent = needs.filter(item => item.isMine).length;
};

async function refreshCommunityData() {
  const data = await nourishApi.bootstrap();
  listings = data.listings;
  pickups = data.pickups;
  saved = data.saved;
  needs = data.needs;
  renderListings();
}

refreshCommunityData().catch(error => {
  console.error("Could not load NourishNear community data.", error);
  toast(error.message);
});

$("#need-prompt").addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    $("#ask-assistant").click();
  }
});

$("#map-location-input").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    $("#map-search").click();
  }
});
$("#map-filter").addEventListener("change", renderFoodMap);
