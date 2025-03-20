// Google Sheets API Configuration
const CLIENT_ID = '609536649533-ta5o3b6d1dgess21sedlr2arsr8ms1h6.apps.googleusercontent.com';
const API_KEY = 'AIzaSyAztNSJf-fBpvsCfrv8x7oR2ViLKRLQErc';
const SPREADSHEET_ID = '1GzdaBH2Hq7LVx9svDkdlMHr01eODjy9haFMTJFIqgI4';
const DISCOVERY_DOCS = ['https://sheets.googleapis.com/$discovery/rest?version=v4'];
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

// Global variables
let tokenClient;
let gapiInited = false;
let gisInited = false;

// Initialize Google APIs
function initGapiClient() {
    gapi.load('client', async () => {
        try {
            await gapi.client.init({
                apiKey: API_KEY,
                discoveryDocs: DISCOVERY_DOCS,
            });
            gapiInited = true;
            maybeEnableApp();
        } catch (error) {
            console.error('Error initializing GAPI client:', error);
            document.getElementById('content').innerHTML = '<p>Error initializing Google APIs. Please refresh the page.</p>';
        }
    });
}

function initGisClient() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
            if (tokenResponse.access_token) {
                gapi.client.setToken(tokenResponse);
                console.log('Authenticated successfully');
                loadDashboard();
            } else {
                console.error('Authentication failed:', tokenResponse);
                document.getElementById('content').innerHTML = '<p>Authentication failed. Please try signing in again.</p>';
            }
        },
    });
    gisInited = true;
    maybeEnableApp();
}

function maybeEnableApp() {
    if (gapiInited && gisInited) {
        console.log('Google APIs initialized');
        handleAuth();
    }
}

// Function to ensure a valid token is available
async function ensureValidToken() {
    const token = gapi.client.getToken();
    if (!token || (token.expires_at && token.expires_at < Date.now() / 1000)) {
        console.log('Access token missing or expired. Requesting new token...');
        return new Promise((resolve, reject) => {
            tokenClient.callback = (tokenResponse) => {
                if (tokenResponse.access_token) {
                    gapi.client.setToken(tokenResponse);
                    console.log('New token acquired');
                    resolve();
                } else {
                    console.error('Failed to acquire new token:', tokenResponse);
                    reject(new Error('Failed to acquire new token'));
                }
            };
            tokenClient.requestAccessToken();
        });
    }
    return Promise.resolve();
}

function handleAuth() {
    if (!gapiInited || !gisInited) {
        console.log('Waiting for Google APIs to initialize...');
        return;
    }
    if (!gapi.client.getToken()) {
        console.log('Initiating Google Sign-In. Current origin (used as redirect_uri):', window.location.origin);
        tokenClient.requestAccessToken();
        setTimeout(() => {
            if (!gapi.client.getToken()) {
                console.warn('Authentication may have failed. Check for popup blockers or redirect_uri mismatch.');
                alert('Authentication popup was blocked or failed. Please allow popups for this site and ensure the redirect URI matches in Google Cloud Console.');
            }
        }, 5000);
    } else {
        loadDashboard();
    }
}

// DOM Elements
const content = document.getElementById('content');
const menuItems = document.querySelectorAll('.menu-item li');

// Menu click handler with authentication check
menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
        const target = e.target.getAttribute('data-target');
        if (target) {
            if (!gapi.client.getToken()) {
                content.innerHTML = '<p>Please sign in to access this feature.</p>';
                handleAuth();
            } else {
                loadForm(target);
            }
        }
    });
});

// Global function to populate items dropdown with retry mechanism
function populateItems(items, maxRetries = 5, retryDelay = 100) {
    console.log('Global populateItems called with items:', items);

    const attemptPopulate = (retryCount) => {
        const select = document.getElementById('item-select');
        if (!select) {
            if (retryCount > 0) {
                console.warn(`item-select element not found, retrying (${retryCount} attempts left)...`);
                setTimeout(() => attemptPopulate(retryCount - 1), retryDelay);
            } else {
                console.error('item-select element not found after maximum retries');
            }
            return;
        }

        // Clear existing options (except the default "-- Select an Item --")
        select.innerHTML = '<option value="">-- Select an Item --</option>';

        // Filter and add items with Remaining > 0
        items.forEach(item => {
            const remaining = parseInt(item.remaining);
            if (!isNaN(remaining) && remaining > 0) {
                console.log('Adding item:', item.name, 'with remaining:', remaining);
                const option = document.createElement('option');
                option.value = item.name;
                option.textContent = item.name;
                select.appendChild(option);
            } else {
                console.log('Skipping item:', item.name, 'with remaining:', remaining);
            }
        });
    };

    attemptPopulate(maxRetries);
}

// Load form directly into content area
async function loadForm(formName) {
    try {
        const response = await fetch(`${formName}-form.html`);
        if (!response.ok) throw new Error('Form not found');
        const formHtml = await response.text();
        
        content.innerHTML = formHtml;

        // Execute the form's script
        const script = content.querySelector('script');
        if (script) {
            eval(script.textContent);
        }

        if (formName === 'add-inventory' || formName === 'adjust-inventory' || formName === 'damage') {
            console.log(`Fetching inventory data for ${formName}`);
            await ensureValidToken(); // Ensure token is valid before API call
            const inventoryResponse = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Inventory!A2:I',
            });
            const rows = inventoryResponse.result.values || [];
            const items = rows.map(row => ({
                name: row[0] || '',
                remaining: parseInt(row[2]) || 0
            }));
            console.log(`Items fetched for ${formName}:`, items);

            // Use MutationObserver to ensure the DOM is ready
            const observer = new MutationObserver((mutations, obs) => {
                const select = document.getElementById('item-select');
                if (select) {
                    populateItems(items);
                    obs.disconnect(); // Stop observing once the element is found
                }
            });
            observer.observe(content, { childList: true, subtree: true });
        } else if (formName === 'view-stock') {
            await ensureValidToken(); // Ensure token is valid before API call
            const inventoryResponse = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Inventory!A2:I',
            });
            const rows = inventoryResponse.result.values || [];
            const items = rows.map(row => {
                const sellingPrice = parseFloat(row[4]) || 0;
                const purchasedPrice = parseFloat(row[3]) || 0;
                const quantitySold = parseInt(row[6]) || 0;
                const discount = 0;
                const profit = (sellingPrice - purchasedPrice) * quantitySold - discount;

                return {
                    itemName: row[0] || '',
                    codeNo: row[1] || '',
                    remaining: parseInt(row[2]) || 0,
                    purchasedPrice: purchasedPrice,
                    sellingPrice: sellingPrice,
                    totalPurchased: parseInt(row[5]) || 0,
                    totalSold: quantitySold,
                    damage: parseInt(row[7]) || 0,
                    profit: profit,
                };
            });
            const script = content.querySelector('script');
            eval(script.textContent);
            populateStockTable(items);
        }

        const saveBtn = content.querySelector('.save');
        const cancelBtn = content.querySelector('.cancel');
        if (saveBtn) saveBtn.addEventListener('click', () => saveFormData(formName));
        if (cancelBtn) cancelBtn.addEventListener('click', loadDashboard);
    } catch (error) {
        console.error('Error loading form:', error);
        content.innerHTML = '<p>Error loading form. Please try again.</p>';
    }
}

// Load default dashboard content
function loadDashboard() {
    content.innerHTML = `
        <div class="main-content">
            <h2>Welcome to Funny Zone Sale Management</h2>
            <p>Select an option from the menu to get started.</p>
        </div>
    `;
}

// Save form data
function saveFormData(formName) {
    if (!gapi.client.getToken()) {
        content.innerHTML = '<p>Please sign in to save data.</p>';
        handleAuth();
        return;
    }
    console.log(`Saving data for ${formName}`);
    switch (formName) {
        case 'add-inventory':
            saveAddInventory();
            break;
        case 'adjust-inventory':
            saveAdjustInventory();
            break;
        case 'damage':
            saveDamage();
            break;
        case 'new-sale':
            saveNewSale();
            break;
        default:
            console.log('Form save not implemented yet');
    }
}

async function saveAddInventory() {
    const form = content.querySelector('form');
    const itemType = form.querySelector('#item-type').value;
    const itemName = itemType === 'new' ? form.querySelector('#item-name').value : form.querySelector('#item-select').value;
    const codeNo = form.querySelector('#code-no').value || '';
    const purchasedPrice = parseFloat(form.querySelector('#purchased-price').value);
    const sellingPrice = parseFloat(form.querySelector('#selling-price').value);
    const totalPurchased = parseInt(form.querySelector('#total-purchased').value);
    const remark = form.querySelector('#remark').value || '';

    // Validate form data
    if (!itemName) {
        console.error('Validation error: Item name is required');
        content.innerHTML = `<p>Error: Item name is required.</p>`;
        return;
    }
    if (isNaN(purchasedPrice) || purchasedPrice <= 0) {
        console.error('Validation error: Purchased price must be a positive number');
        content.innerHTML = `<p>Error: Purchased price must be a positive number.</p>`;
        return;
    }
    if (isNaN(sellingPrice) || sellingPrice <= 0) {
        console.error('Validation error: Selling price must be a positive number');
        content.innerHTML = `<p>Error: Selling price must be a positive number.</p>`;
        return;
    }
    if (isNaN(totalPurchased) || totalPurchased <= 0) {
        console.error('Validation error: Total purchased must be a positive integer');
        content.innerHTML = `<p>Error: Total purchased must be a positive integer.</p>`;
        return;
    }

    console.log('Form data:', { itemName, codeNo, purchasedPrice, sellingPrice, totalPurchased, remark });

    try {
        // Ensure a valid token before making API calls
        await ensureValidToken();

        console.log('Fetching inventory data...');
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Inventory!A2:J',
        });
        console.log('Inventory data fetched:', response.result);
        const rows = response.result.values || [];
        
        const existingRowIndex = rows.findIndex(row => 
            row[0] === itemName && 
            parseFloat(row[3]) === purchasedPrice && 
            parseFloat(row[4]) === sellingPrice
        );
        console.log('Existing row index:', existingRowIndex);

        if (existingRowIndex >= 0) {
            const currentTotalPurchased = parseInt(rows[existingRowIndex][5]) || 0;
            const newTotalPurchased = currentTotalPurchased + totalPurchased;
            console.log('Updating existing item. New total purchased:', newTotalPurchased);
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `Inventory!F${existingRowIndex + 2}`,
                valueInputOption: 'RAW',
                resource: { values: [[newTotalPurchased]] },
            });
            console.log('Existing item updated successfully');
        } else {
            const newRow = [
                itemName,
                codeNo,
                totalPurchased,
                purchasedPrice,
                sellingPrice,
                totalPurchased,
                0,
                0,
                0,
                remark
            ];
            console.log('Appending new row:', newRow);
            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Inventory!A2:J',
                valueInputOption: 'RAW',
                resource: { values: [newRow] },
            });
            console.log('New item appended successfully');
        }
        console.log('Inventory updated successfully');
        content.innerHTML = '<p>Inventory saved successfully!</p>';
        setTimeout(loadDashboard, 2000);
    } catch (error) {
        console.error('Error saving inventory:', error);
        if (error.result && error.result.error) {
            console.error('Google Sheets API error details:', error.result.error);
            if (error.result.error.code === 401) {
                content.innerHTML = `<p>Error: Authentication failed. Please sign in again.</p>`;
                setTimeout(() => {
                    gapi.client.setToken(null); // Clear the token
                    handleAuth(); // Prompt for re-authentication
                }, 2000);
            } else {
                content.innerHTML = `<p>Error saving inventory: ${error.result.error.message || 'Unknown error'}. Please try again.</p>`;
            }
        } else {
            content.innerHTML = `<p>Error saving inventory: ${error.message || 'Unknown error'}. Please try again.</p>`;
        }
    }
}

async function saveAdjustInventory() {
    const form = content.querySelector('form');
    const itemName = form.querySelector('#item-select').value;
    const adjustmentType = form.querySelector('#adjustment-type').value;
    const quantity = parseInt(form.querySelector('#quantity').value);

    try {
        await ensureValidToken();
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Inventory!A2:J',
        });
        const rows = response.result.values || [];

        const rowIndex = rows.findIndex(row => row[0] === itemName);
        if (rowIndex === -1) {
            throw new Error('Item not found in Inventory');
        }

        const currentTotalPurchased = parseInt(rows[rowIndex][5]) || 0;
        let newTotalPurchased;
        if (adjustmentType === 'add') {
            newTotalPurchased = currentTotalPurchased + quantity;
        } else {
            newTotalPurchased = currentTotalPurchased - quantity;
            if (newTotalPurchased < 0) {
                throw new Error('Cannot subtract more than the current total purchased quantity');
            }
        }

        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Inventory!F${rowIndex + 2}`,
            valueInputOption: 'RAW',
            resource: { values: [[newTotalPurchased]] },
        });

        console.log('Inventory adjusted successfully');
        content.innerHTML = '<p>Inventory adjusted successfully!</p>';
        setTimeout(loadDashboard, 2000);
    } catch (error) {
        console.error('Error adjusting inventory:', error);
        content.innerHTML = `<p>${error.message || 'Error adjusting inventory. Please try again.'}</p>`;
    }
}

async function saveDamage() {
    const form = content.querySelector('form');
    const itemName = form.querySelector('#item-select').value;
    const damageQuantity = parseInt(form.querySelector('#damage-quantity').value);
    const remark = form.querySelector('#remark').value || '';

    try {
        await ensureValidToken();
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Inventory!A2:J',
        });
        const rows = response.result.values || [];

        const rowIndex = rows.findIndex(row => row[0] === itemName);
        if (rowIndex === -1) {
            throw new Error('Item not found in Inventory');
        }

        const remaining = parseInt(rows[rowIndex][2]) || 0;
        if (damageQuantity > remaining) {
            throw new Error('Damage quantity cannot exceed remaining stock');
        }

        const currentDamage = parseInt(rows[rowIndex][7]) || 0;
        const newDamage = currentDamage + damageQuantity;

        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Inventory!H${rowIndex + 2}`,
            valueInputOption: 'RAW',
            resource: { values: [[newDamage]] },
        });

        if (remark) {
            const currentRemark = rows[rowIndex][9] || '';
            const updatedRemark = currentRemark ? `${currentRemark}; ${remark}` : remark;
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `Inventory!J${rowIndex + 2}`,
                valueInputOption: 'RAW',
                resource: { values: [[updatedRemark]] },
            });
        }

        console.log('Damage recorded successfully');
        content.innerHTML = '<p>Damage recorded successfully!</p>';
        setTimeout(loadDashboard, 2000);
    } catch (error) {
        console.error('Error recording damage:', error);
        content.innerHTML = `<p>${error.message || 'Error recording damage. Please try again.'}</p>`;
    }
}

async function saveNewSale() {
    const form = content.querySelector('form');
    const data = {
        orderDate: form.querySelector('#order-date').value,
        customerName: form.querySelector('#customer-name').value,
    };
    console.log('New Sale Data:', data);
    content.innerHTML = '<p>New sale saved successfully!</p>';
    setTimeout(loadDashboard, 2000);
}

// Initialize app on page load
document.addEventListener('DOMContentLoaded', () => {
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.onload = initGapiClient;
    document.body.appendChild(gapiScript);

    const gisScript = document.createElement('script');
    gisScript.src = 'https://accounts.google.com/gsi/client';
    gisScript.onload = initGisClient;
    document.body.appendChild(gisScript);
});