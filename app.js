const seedListings = [
  { id: "seed-1", title: "Homestyle dal & rice", category: "Meals", quantity: 4, unit: "servings", location: "Kothrud, Pune", distance: 0.8, pickup: "Today, 7:00–8:30 PM", donor: "Meera K.", initials: "M", description: "Freshly cooked yellow dal, jeera rice and a little homemade pickle. Packed separately and ready to share.", image: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=700&q=80", status: "available", createdAt: Date.now() - 600000 },
  { id: "seed-2", title: "Garden-fresh veggie box", category: "Produce", quantity: 2, unit: "boxes", location: "Karve Nagar, Pune", distance: 1.2, pickup: "Today, 5:30–7:00 PM", donor: "Rohan P.", initials: "R", description: "A lovely mix of tomatoes, spinach, okra and coriander from our home garden. Bring a reusable bag.", image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=700&q=80", status: "available", createdAt: Date.now() - 1800000 },
  { id: "seed-3", title: "Freshly baked sourdough", category: "Bakery", quantity: 3, unit: "loaves", location: "Deccan, Pune", distance: 2.1, pickup: "Today, before 8:00 PM", donor: "Olive & Grain", initials: "O", description: "Three country sourdough loaves baked this morning. Still soft, crusty and full of love.", image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=700&q=80", status: "available", createdAt: Date.now() - 3600000 },
  { id: "seed-4", title: "Celebration meal boxes", category: "Meals", quantity: 8, unit: "boxes", location: "Erandwane, Pune", distance: 2.7, pickup: "Today, 8:00–9:00 PM", donor: "The Tiffin Table", initials: "T", description: "A few extra vegetarian meal boxes from tonight's catering. Each one has two rotis, sabzi and rice.", image: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=700&q=80", status: "available", createdAt: Date.now() - 7200000 },
  { id: "seed-5", title: "Farm-fresh milk & yogurt", category: "Dairy", quantity: 4, unit: "items", location: "Shivajinagar, Pune", distance: 3.1, pickup: "Tomorrow, 8:00–10:00 AM", donor: "Anaya S.", initials: "A", description: "Unopened, locally sourced milk and plain yogurt. Kept chilled and best enjoyed fresh.", image: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=700&q=80", status: "available", createdAt: Date.now() - 10800000 },
  { id: "seed-6", title: "Sunday brunch pastries", category: "Bakery", quantity: 6, unit: "pastries", location: "Aundh, Pune", distance: 4.6, pickup: "Today, before 6:00 PM", donor: "Butter & Bloom", initials: "B", description: "A mix of croissants and fruit danishes from our neighborhood bakery. Baked fresh this morning.", image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=700&q=80", status: "available", createdAt: Date.now() - 14400000 }
];

const sourceLabels = {
  "Home / household": "Home",
  "Restaurant / cafe": "Restaurant",
  "Wedding / marriage function": "Wedding",
  "Birthday / party": "Party",
  "Hotel / caterer": "Hotel / catering",
  "Community kitchen / NGO": "Community group"
};
const photoFallbacks = {
  Meals: seedListings[0].image,
  Produce: seedListings[1].image,
  Bakery: seedListings[2].image,
  Dairy: seedListings[4].image,
  Other: seedListings[0].image
};
seedListings.forEach((item, index) => {
  item.source = ["Home / household", "Home / household", "Restaurant / cafe", "Wedding / marriage function", "Hotel / caterer", "Birthday / party"][index];
});

let listings = [];
let pickups = [];
let saved = [];
let selectedCategory = "All";
let currentPage = "discover";
let activeListingId = null;
const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
function foodPhoto(item, className = "") {
  const fallback = photoFallbacks[item.category] || photoFallbacks.Other;
  const image = item.image || fallback;
  const label = item.photoUploaded ? "📷 Donor photo" : "Food idea";
  return `<img class="${className}" src="${esc(image)}" data-fallback="${esc(fallback)}" alt="${esc(item.title)}" loading="lazy"><span class="photo-origin">${label}</span>`;
}
async function compressFoodPhoto(file) {
  if (!file || !file.size) return "";
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Please choose a JPEG, PNG, or WebP food photo.");
  }
  if (file.size > 12 * 1024 * 1024) throw new Error("Please choose a photo smaller than 12 MB.");
  if (!window.createImageBitmap) throw new Error("Photo upload is not supported by this browser.");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    let scale = Math.min(1, 1280 / bitmap.width, 960 / bitmap.height);
    for (let resize = 0; resize < 4; resize += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare this food photo. Please try another image.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.78, 0.62, 0.48]) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= 900_000) {
          return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Could not read this food photo. Please try again."));
            reader.readAsDataURL(blob);
          });
        }
      }
      scale *= 0.72;
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Could not")) throw error;
    throw new Error("Could not open this food photo. Please choose a different image.");
  } finally {
    bitmap?.close();
  }
  throw new Error("This photo could not be compressed enough. Please choose a smaller image.");
}
function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  $("#toast-region").append(node);
  window.setTimeout(() => node.remove(), 3100);
}
const available = () => listings.filter(item => item.status === "available");

function filteredListings() {
  const query = $("#search-input").value.trim().toLowerCase();
  const location = $("#location-input").value.trim().toLowerCase().replace(/,\s*india$/, "");
  const statewideSearch = ["uttar pradesh", "up", "uttar pradesh, india"].includes(location);
  const matches = available().filter(item => {
    const text = `${item.title} ${item.description} ${item.category} ${item.source || "Home"} ${item.location} ${item.donor}`.toLowerCase();
    const locationMatch = !location || (statewideSearch
      ? item.location.toLowerCase().includes("uttar pradesh")
      : item.location.toLowerCase().includes(location));
    return (!query || text.includes(query)) && locationMatch && (selectedCategory === "All" || item.category === selectedCategory);
  });
  const sort = $("#sort-select").value;
  if (sort === "newest") matches.sort((a, b) => b.createdAt - a.createdAt);
  if (sort === "nearby") matches.sort((a, b) => {
    if (donorCoordinates && a.mapCoordinates && b.mapCoordinates) {
      return distanceBetween(donorCoordinates, a.mapCoordinates) - distanceBetween(donorCoordinates, b.mapCoordinates);
    }
    return b.createdAt - a.createdAt;
  });
  if (sort === "quantity") matches.sort((a, b) => b.quantity - a.quantity);
  return matches;
}
function card(item) {
  const isSaved = saved.includes(item.id);
  const source = item.source || "Home / household";
  const distance = donorCoordinates && item.mapCoordinates
    ? ` · ${distanceBetween(donorCoordinates, item.mapCoordinates).toFixed(1)} km`
    : "";
  return `<article class="food-card"><div class="food-image">${foodPhoto(item)}<span class="food-badge">${esc(item.category)}</span><button class="save-button ${isSaved ? "saved" : ""}" data-save="${esc(item.id)}" aria-label="${isSaved ? "Remove saved listing" : "Save listing"}">${isSaved ? "♥" : "♡"}</button></div><div class="food-card-body"><div class="food-card-head"><h3>${esc(item.title)}</h3><span class="fresh-tag">${esc(sourceLabels[source] || source)}${item.demo ? " · DEMO" : ""}</span></div><p class="food-description">${esc(item.description)}</p><div class="food-meta"><div class="food-meta-row"><span class="meta-icon">♧</span><span><strong>${esc(item.quantity)} ${esc(item.unit)}</strong> available</span></div><div class="food-meta-row"><span class="meta-icon">⌂</span><span>${esc(source)}</span></div><div class="food-meta-row"><span class="meta-icon">⌖</span><span>${esc(item.location)}${distance}</span></div><div class="food-meta-row"><span class="meta-icon">◷</span><span>${esc(item.pickup)}</span></div></div><div class="food-card-bottom"><div class="donor-mini"><span class="donor-avatar">${esc(item.initials)}</span><span class="donor-name">${esc(item.donor)}</span></div><button class="claim-button" data-details="${esc(item.id)}">View & request →</button></div></div></article>`;
}
function renderCounts() {
  $("#donation-count").textContent = listings.filter(item => item.isMine).length;
  $("#pickup-count").textContent = pickups.length;
}
function renderListings() {
  const items = filteredListings();
  $("#food-grid").innerHTML = items.map(card).join("");
  $("#food-grid").classList.toggle("hidden", items.length === 0);
  $("#empty-state").classList.toggle("hidden", items.length > 0);
  $("#result-count").textContent = `${items.length} ${items.length === 1 ? "find" : "finds"}`;
  $("#impact-active").textContent = available().length;
  $("#nearby-count").textContent = available().length + 6;
  renderCounts();
}
function showModal(markup) {
  $("#modal-content").innerHTML = markup;
  $("#modal-backdrop").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  window.setTimeout(() => $("#modal-content input, #modal-content select")?.focus(), 30);
}
function closeModal() {
  $("#modal-backdrop").classList.add("hidden");
  document.body.style.overflow = "";
  activeListingId = null;
}
function openDonationForm() {
  showModal(`<span class="modal-kicker">A LITTLE GOOD GOES A LONG WAY</span><h2 id="modal-title">Share a meal.</h2><p class="modal-copy">List your extra food and help it find a happy home nearby.</p><form id="donation-form"><div class="form-grid"><div class="form-field full"><label for="donation-title">What are you sharing? *</label><input id="donation-title" name="title" required maxlength="55" placeholder="e.g. Homemade vegetable pulao"></div><div class="form-field"><label for="donation-category">Food category *</label><select id="donation-category" name="category" required><option value="">Choose one</option><option>Meals</option><option>Produce</option><option>Bakery</option><option>Dairy</option><option>Other</option></select></div><div class="form-field"><label for="donation-source">Where is the food from? *</label><select id="donation-source" name="source" required><option>Home / household</option><option>Restaurant / cafe</option><option>Wedding / marriage function</option><option>Birthday / party</option><option>Community event / festival</option><option>Office / school event</option><option>Hotel / caterer</option><option>Community kitchen / NGO</option><option>Other</option></select></div><div class="form-field"><label for="donation-quantity">Quantity *</label><input id="donation-quantity" name="quantity" type="number" min="1" max="500" required placeholder="e.g. 4"></div><div class="form-field"><label for="donation-unit">Unit *</label><select id="donation-unit" name="unit" required><option>servings</option><option>boxes</option><option>portions</option><option>items</option><option>kg</option><option>loaves</option></select></div><div class="form-field"><label for="donation-pickup">Pickup time *</label><input id="donation-pickup" name="pickup" required maxlength="60" placeholder="Today, 6:00–8:00 PM"></div><div class="form-field"><label for="donation-location">Pickup city or area *</label><input id="donation-location" name="location" required maxlength="70" placeholder="e.g. Gomti Nagar, Lucknow or Paris, France"></div><div class="form-field full"><label for="donation-photo">Food photo (optional)</label><input id="donation-photo" name="image" type="file" accept="image/jpeg,image/png,image/webp"><small class="photo-help">JPEG, PNG, or WebP · max 12 MB before compression</small></div><div class="form-field full"><label for="donation-description">A few details for your neighbor *</label><textarea id="donation-description" name="description" required maxlength="220" placeholder="Ingredients, storage, or anything useful to know..."></textarea></div></div><button class="button button-primary modal-submit" type="submit">Share with my neighborhood <span>→</span></button></form>`);
}
function openDetails(id) {
  const item = listings.find(listing => listing.id === id);
  if (!item || item.status !== "available") return toast("This food has already been picked up.");
  activeListingId = id;
  showModal(`<span class="modal-kicker">${esc(item.category.toUpperCase())} · ${esc(item.distance)} KM AWAY</span><h2 id="modal-title">${esc(item.title)}</h2><div class="detail-photo-wrap">${foodPhoto(item, "detail-image")}</div><p class="detail-description">${esc(item.description)}</p><div class="detail-facts"><div class="detail-fact"><span>AVAILABLE</span><strong>${esc(item.quantity)} ${esc(item.unit)}</strong></div><div class="detail-fact"><span>FOOD SOURCE</span><strong>${esc(item.source || "Home / household")}</strong></div><div class="detail-fact"><span>PICKUP WINDOW</span><strong>${esc(item.pickup)}</strong></div><div class="detail-fact"><span>PICKUP NEAR</span><strong>${esc(item.location)}</strong></div><div class="detail-fact"><span>SHARED BY</span><strong>${esc(item.donor)}</strong></div></div><form id="pickup-form"><div class="form-field"><label for="pickup-quantity">How many ${esc(item.unit)} would you like? (up to ${esc(item.quantity)})</label><input id="pickup-quantity" name="quantity" type="number" min="1" max="${Number(item.quantity)}" value="1" required></div><button class="button button-primary modal-submit" type="submit">Request pickup <span>→</span></button></form>`);
}
function navigate(page) {
  currentPage = page;
  document.querySelectorAll(".page-view").forEach(view => view.classList.add("hidden"));
  $(`#page-${page}`).classList.remove("hidden");
  document.querySelectorAll(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.page === page));
  $("#breadcrumb-page").textContent = ({ discover: "Discover food", "my-donations": "My donations", "my-pickups": "My pickups" })[page];
  if (page === "my-donations") renderDonations();
  if (page === "my-pickups") renderPickups();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function renderDonations() {
  const own = listings.filter(item => item.isMine);
  const unitTotals = new Map();
  for (const item of own) {
    const unit = item.unit || "items";
    unitTotals.set(unit, (unitTotals.get(unit) || 0) + (Number(item.originalQuantity) || item.quantity));
  }
  const placeGroups = new Map();
  for (const item of own) {
    const place = item.location;
    if (!placeGroups.has(place)) placeGroups.set(place, []);
    placeGroups.get(place).push(item);
  }
  const totalSummary = unitTotals.size
    ? [...unitTotals].map(([unit, quantity]) => `${quantity} ${unit}`).join(" · ")
    : "0";
  const donatedCount = own.length;
  $("#donation-summary").innerHTML = `<div class="summary-card"><span>TOTAL FOOD DONATED</span><strong>${esc(totalSummary)}</strong></div><div class="summary-card"><span>DONATION AREAS</span><strong>${placeGroups.size}</strong></div><div class="summary-card"><span>FOOD LISTINGS</span><strong>${donatedCount}</strong></div>`;
  $("#donation-places").innerHTML = placeGroups.size
    ? [...placeGroups].map(([place, items]) => {
      const totals = new Map();
      for (const item of items) {
        const unit = item.unit || "items";
        totals.set(unit, (totals.get(unit) || 0) + (Number(item.originalQuantity) || item.quantity));
      }
      return `<article class="list-row donation-place-row"><span class="request-row-icon">⌖</span><div class="list-row-main"><strong>${esc(place)}</strong><span>${items.length} food ${items.length === 1 ? "donation" : "donations"} · ${esc([...totals].map(([unit, quantity]) => `${quantity} ${unit}`).join(" · "))}</span></div><a class="map-area-link" href="https://www.openstreetmap.org/search?query=${encodeURIComponent(place)}" target="_blank" rel="noopener noreferrer">View area ↗</a></article>`;
    }).join("")
    : `<div class="list-empty">Your donated food and drop-off areas will be listed here.</div>`;
  $("#donation-list").innerHTML = own.length ? own.slice().reverse().map(item => `<article class="list-row"><img src="${esc(item.image)}" alt=""><div class="list-row-main"><strong>${esc(item.title)}</strong><span>${esc(item.location)} · ${esc(item.pickup)} · ${esc(item.source || "Home / household")}</span></div><span class="row-quantity">${esc(item.originalQuantity || item.quantity)} ${esc(item.unit)}</span><span class="status-pill ${item.status === "available" ? "active" : item.status === "matched" ? "matched" : item.status === "delivered" ? "delivered" : "taken"}">${item.status === "available" ? "Available" : item.status === "matched" ? "Matched · handover pending" : item.status === "delivered" ? "Delivered" : "Picked up"}</span></article>`).join("") : `<div class="list-empty">Nothing shared just yet. Your first donation could make someone's day.<br><button class="button button-primary" style="margin-top:12px" data-open-donate>＋ Share food</button></div>`;
}
function renderPickups() {
  $("#pickup-summary").innerHTML = `<div class="summary-card"><span>PICKUPS REQUESTED</span><strong>${pickups.length}</strong></div><div class="summary-card"><span>PORTIONS CLAIMED</span><strong>${pickups.reduce((sum, item) => sum + item.quantity, 0)}</strong></div><div class="summary-card"><span>NEIGHBORHOODS VISITED</span><strong>${new Set(pickups.map(item => item.location)).size}</strong></div>`;
  $("#pickup-list").innerHTML = pickups.length ? pickups.slice().reverse().map(item => `<article class="list-row"><img src="${esc(item.image)}" alt=""><div class="list-row-main"><strong>${esc(item.title)}</strong><span>${esc(item.location)} · ${esc(item.pickup)}</span></div><span class="row-quantity">${esc(item.quantity)} ${esc(item.unit)}</span><span class="status-pill active">Pickup requested</span></article>`).join("") : `<div class="list-empty">Your pickup list is waiting for something delicious.<br>Explore what's being shared in your neighborhood.</div>`;
}

document.addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.page) navigate(button.dataset.page);
  if (button.hasAttribute("data-open-donate")) openDonationForm();
  if (button.dataset.details) openDetails(button.dataset.details);
  if (button.dataset.category) {
    selectedCategory = button.dataset.category;
    document.querySelectorAll(".category-chip").forEach(chip => chip.classList.toggle("selected", chip.dataset.category === selectedCategory));
    renderListings();
  }
  if (button.dataset.save) {
    try {
      const result = await nourishApi.toggleSaved(button.dataset.save);
      saved = result.saved ? [...saved, button.dataset.save] : saved.filter(id => id !== button.dataset.save);
      renderListings();
      toast(result.saved ? "Saved for later." : "Removed from saved food.");
    } catch (error) {
      toast(error.message);
    }
  }
  if (button.id === "modal-close" || button.id === "modal-backdrop") closeModal();
  if (button.id === "search-button") {
    renderListings();
  }
  if (button.id === "clear-filters") {
    selectedCategory = "All"; $("#search-input").value = ""; $("#location-input").value = "Uttar Pradesh";
    document.querySelectorAll(".category-chip").forEach(chip => chip.classList.toggle("selected", chip.dataset.category === "All"));
    renderListings();
  }
  if (button.dataset.mapPin !== undefined) {
    const item = filteredListings()[Number(button.dataset.mapPin)];
    if (item) openDetails(item.id); else toast("Explore the food listings to find a nearby pick.");
  }
  if (button.id === "notification-button") toast("You're all caught up. Thanks for being here!");
});

document.addEventListener("submit", async event => {
  if (event.target.id === "donation-form") {
    event.preventDefault();
    const data = new FormData(event.target);
    const category = String(data.get("category"));
    try {
      const photo = await compressFoodPhoto(data.get("image"));
      const submission = {
        title: String(data.get("title")).trim(), category, quantity: Number(data.get("quantity")),
        unit: String(data.get("unit")), location: String(data.get("location")).trim(),
        pickup: String(data.get("pickup")).trim(), source: String(data.get("source")), description: String(data.get("description")).trim(),
        image: photo || photoFallbacks[category] || photoFallbacks.Other,
      };
      const { listing } = await nourishApi.createListing(submission);
      listings.push(listing); closeModal(); renderListings();
      if (currentPage === "my-donations") renderDonations();
      toast(photo ? "Your food is listed with its photo. Thank you for sharing!" : "Your food is listed. Thank you for sharing!");
    } catch (error) {
      toast(error.message);
    }
  }
  if (event.target.id === "pickup-form") {
    event.preventDefault();
    const item = listings.find(listing => listing.id === activeListingId);
    const quantity = Number(new FormData(event.target).get("quantity"));
    if (!item || item.status !== "available") { closeModal(); renderListings(); return toast("Sorry, this food has already been picked up."); }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > item.quantity) return toast("Please choose an available quantity.");
    try {
      const result = await nourishApi.createPickup({ listingId: item.id, quantity });
      Object.assign(item, result.listing);
      pickups.push(result.pickup);
      closeModal(); renderListings(); toast("Pickup requested! Details are saved in My pickups.");
    } catch (error) {
      toast(error.message);
    }
  }
});
document.addEventListener("error", event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.dataset.fallback || image.dataset.fallback === image.src) return;
  image.src = image.dataset.fallback;
  image.dataset.fallback = "";
}, true);
document.addEventListener("input", event => { if (event.target.id === "search-input" || event.target.id === "location-input") renderListings(); });
$("#sort-select").addEventListener("change", renderListings);
$("#modal-backdrop").addEventListener("click", event => { if (event.target.id === "modal-backdrop") closeModal(); });
document.addEventListener("keydown", event => { if (event.key === "Escape" && !$("#modal-backdrop").classList.contains("hidden")) closeModal(); });