document.addEventListener("DOMContentLoaded", () => {
    // Get current page filename
    const currentPage = window.location.pathname;
    
    // Don't protect login and registration pages
    if (currentPage.includes('staff-login.html') || currentPage.includes('staff-register.html')) {
        return; // Exit - no authentication check needed
    }
    
    // Check if user is authenticated
    if (!localStorage.getItem("staffUID")) {
        window.location.replace("staff-login.html");
    }
});