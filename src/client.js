const PUB = window.postMessage;
const SUB = window.addEventListener;

// Iframe Configuration to render preference center.
const CREDENTIALS = {
    tenantId: "app-eu~b231175d-48a8-41a4-85c2-441d3617ae48",
    preferenceCenterId: "53727338-7b6c-4ad8-8b28-3d307ccc3bb2",
    primaryIdentifier: '',
    // locationCode is REQUIRED for recording consents: without it the SDK sends
    // location_code=default and the record API returns
    // "invalid location code: default, please use the ISO two-letter code".
    // Any ISO 3166-1 alpha-2 code works for recording (verified EU/DE/GB/US).
    // With Location Intelligence disabled the default preference center is
    // rendered regardless of this value.
    locationCode: 'IN',
    languageCode: 'en',
    implicitFlow: true,
    implicitRecordConsents: false,
    allMandatory: false
};

(function () {
    //? STEP 1: subscribe to window events
    SUB("message", handleWindowEvents);

    //? STEP 2: Get the iframe ref and add an onload event listener.
    // As and when iframe loaded(i.e, preference center) client/parent window can send the information that iframe needs
    // in order to load the consents.
    const preferenceIframeRef = document.getElementById("preferenceIframe");
    let configSent = false;

    preferenceIframeRef.addEventListener("load", (ev) => {
        //? STEP 3: Load the config into iframe/sdk.
        loadConfigIntoIframe()
    });

    // FIX: the iframe is small and often finishes loading *before* this script
    // attaches the "load" listener above (especially on a CDN/static host),
    // so the INIT event would never be sent. Also send the config if the iframe
    // is already loaded, and keep retrying until the iframe has picked it up.
    if (isIframeAlreadyLoaded()) {
        loadConfigIntoIframe();
    }
    const initRetry = setInterval(() => {
        if (configSent || !isIframeAlreadyLoaded()) return;
        loadConfigIntoIframe();
    }, 250);
    setTimeout(() => clearInterval(initRetry), 10000);

    //? STEP 4: Attach a listener to the primary identifier and let the iframe know about the change.
    const primaryIdentifierRef = document.getElementById('email');
    const emailHintRef = document.getElementById('emailHint');
    const statusRef = document.getElementById('pcStatus');
    primaryIdentifierRef.addEventListener('input', handlePrimaryIdChange);

    // primary identifier already provided then update ui
    if (CREDENTIALS.primaryIdentifier) {
        primaryIdentifierRef.value = CREDENTIALS.primaryIdentifier;
    }

    function isIframeAlreadyLoaded() {
        try {
            const doc = preferenceIframeRef.contentDocument;
            return !!doc && doc.readyState === 'complete' && !!doc.getElementById('consents');
        } catch (e) {
            return false;
        }
    }

    // Load config into iframe.
    function loadConfigIntoIframe() {
        //? Step 2: Load Credentials into iframe.
        PUB(
            {
                type: "INIT_PREFERENCE_CENTER",
                config: CREDENTIALS
            },
            '*'
        );
        // Mark as sent once the iframe has actually injected the Securiti SDK.
        try {
            const sdkLoaded = !!preferenceIframeRef.contentDocument
                .querySelector('script[src*="preference-center-sdk.js"]');
            if (sdkLoaded) configSent = true;
        } catch (e) { /* cross-origin – ignore */ }
    }

    // Subscribing iframe events.
    function handleWindowEvents(evt) {
        const evtType = getEventType(evt);

        if (evtType.toUpperCase() === 'PREFERENCE_CENTER_LOADED') {
            configSent = true;
        }

        // CONSENTS_PROVIDED EVENT
        // fired when user clicks on submit.
        if (evtType.toUpperCase() === 'CONSENTS_PROVIDED') {
            // Guard: never record consents against an invalid email.
            if (!isEmailValid()) {
                showStatus('Please enter a valid email address before submitting.', 'error');
                return;
            }
            showStatus('Saving your preferences…', 'info');
            PUB({
                type: "RECORD_CONSENTS",
                value: true
            }, '*');
        } else if (evtType.toUpperCase() === 'CONSENTS_RECORDED') {
            // Final success event from the iframe.
            showStatus('Your preferences have been saved. Thank you!', 'success');
            preferenceIframeRef.hidden = true;
        } else if (evtType.toUpperCase() === 'CONSENTS_FAILED_TO_RECORD') {
            showStatus('Sorry, we could not save your preferences. Please try again.', 'error');
        } else if (evtType.toUpperCase() === 'INVALID_CONFIG'
                || evtType.toUpperCase() === 'FAILED_TO_LOAD_PREFERENCE_CENTER') {
            // e.g. wrong tenant/preference-center id, unpublished PC, or
            // "CodeInvalidGeolocationPreferenceCenter" from the API.
            console.error('Securiti preference center failed to load:', evtType, evt.data);
            showStatus('The preference center is not available right now. Please try again later.', 'error');
        }else if(evtType.toUpperCase() === 'USER_CONSENTS_SNAPSHOT') {
            // This will be fired when `GET_USER_CONSENTS_SNAPSHOT` event
            // is fired fromm parent window.

            // Consents snapshot
            // client/tenant can save this and pass it again to prepopulate the form.
            const consents = evt.data
        }
    }

    // Update primary identifer in sdk.
    function handlePrimaryIdChange(ev) {
        const value = ev.target.value.trim();
        const valid = isEmailValid();

        // Only hand a *valid* email to the SDK as the primary identifier;
        // an empty value keeps the SDK's Submit disabled.
        PUB({
            type: 'SET_PRIMARY_IDENTIFIER',
            value: valid ? value : ''
        }, '*')

        if (emailHintRef) emailHintRef.hidden = valid || value === '';
        if (statusRef && !statusRef.hidden && statusRef.dataset.kind === 'error') hideStatus();
    }

    // Email validation (HTML5 validity + a sane fallback pattern).
    function isEmailValid() {
        const value = primaryIdentifierRef.value.trim();
        if (!value) return false;
        if (typeof primaryIdentifierRef.checkValidity === 'function' && !primaryIdentifierRef.checkValidity()) return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
    }

    // Simple status banner shown under the form.
    function showStatus(message, kind) {
        if (!statusRef) return;
        statusRef.textContent = message;
        statusRef.dataset.kind = kind || 'info';
        statusRef.className = 'pc-status pc-status--' + (kind || 'info');
        statusRef.hidden = false;
    }
    function hideStatus() {
        if (statusRef) statusRef.hidden = true;
    }

    // We will get all the consents user has given
    // in `USER_CONSENTS_SNAPSHOT` when this event is fired.
    function getUserConsentsSnapshot() {
        PUB({
            type: 'GET_USER_CONSENTS_SNAPSHOT'
        }, '*')
    }

    // To unsubscribe window events.
    function unsubscribeWindowEvents() {
        window.removeEventListener('message', handleWindowEvents);
    }
    /** END OF OPTIONAL STEPS */

    function getEventType(evt) {
        return (evt.data && evt.data.type) || "UNKNOWN";
    }

})();
