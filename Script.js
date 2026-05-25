
        // Initialize Supabase Client
    const supabaseUrl = 'https://sfdozziezseywauuqddk.supabase.co';
    const supabaseKey = 'sb_publishable_xTaqAs_Dg1akwQ5QumtXbA_eJ5N2vtp';
    const client = supabase.createClient(supabaseUrl, supabaseKey);
    const clientBlog = supabase.createClient(supabaseUrl, supabaseKey);
    
        
        // Check if user is already logged in, redirect to Admin.html
if (window.location.pathname === '/Login.html') {
    window.addEventListener('DOMContentLoaded', async () => {
        const { data: { session }, error: sessionError } = await client.auth.getSession();
        if (sessionError) {
            console.error("Session error:", sessionError.message);
            return;
        }
        console.log(session)

        if (session) {
            window.location.href = 'Admin.html';
        }
    });
}





    

        function togglePassword() {
            const passwordInput = document.getElementById('password');
            const icon = document.getElementById('visibility-icon');
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                icon.innerText = 'visibility_off';
            } else {
                passwordInput.type = 'password';
                icon.innerText = 'visibility';
            }
        }

        async function handleLogin(event) {
            event.preventDefault();
            const errorAlert = document.getElementById('error-alert');
            const errorText = errorAlert.querySelector('span.font-label-sm');
            const submitBtn = event.target.querySelector('button[type="submit"]');
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            errorAlert.classList.add('hidden');

            // Visual feedback for processing
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-80');
            submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">progress_activity</span> Processing...';

            try {
                // Attempt standard Supabase Auth login
                const { data, error } = await client.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (error) {
                    throw error;
                }

                // If successful, check if they exist in the members table and have administrative rights
                const { data: member, error: memberError } = await client
                    .from('members')
                    .select('role')
                    .eq('email', email)
                    .maybeSingle();

                if (memberError) {
                    console.error('Error fetching member profile:', memberError);
                }

                // Check roles: Allow ONLY 'admin' to log in to dashboard
                if (!member || member.role !== 'admin') {
                    await client.auth.signOut();
                    throw new Error('Access denied: Only users with the role admin can access the administration dashboard.');
                }

                // Success! Redirect to Admin.html
                console.log(member)
                // localStorage.setItem('role',member.role)
                window.location.href = 'Admin.html';

            } catch (err) {
                console.error('Login error:', err);
                errorText.innerText = err.message || 'Invalid email or password. Please verify your credentials.';
                errorAlert.classList.remove('hidden');

                // Shake effect on card
                const card = errorAlert.parentElement;
                card.classList.add('translate-x-1');
                setTimeout(() => card.classList.remove('translate-x-1'), 100);
            } finally {
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-80');
                submitBtn.innerHTML = '<span>Sign In</span><span class="material-symbols-outlined">login</span>';
            }
        }
    
        // admin JS
        const role = localStorage.getItem('role');

        if(window.location.pathname === '/Admin.html'){
         async function checkAuth() {
            const { data: { session }, error } = await client.auth.getSession();
            if (error || !session) {
                window.location.href = 'Login.html';
                return;
            }

            try {
                // Fetch the member role by email to strictly ensure only admin gets access
                const { data: member, error: memberError } = await client
                    .from('members')
                    .select('role, name')
                    .eq('email', session.user.email)
                    .maybeSingle();

                if (memberError || !member || member.role !== 'admin') {
                    console.warn('Access Denied: Logged in user is not an admin.');
                    await client.auth.signOut();
                    window.location.href = 'Login.html';
                    return;
                }
              

                // Render user details (optional)
                const userEmail = session.user.email;
                const userName = member.name
                const adminLabel = document.querySelector('header span.font-semibold');
                document.getElementById('AdminName').textContent = userName;
               

                // Load live dashboard data
                loadDashboardStats();
                loadActivityLog();
            } catch (err) {
                console.error('Authentication verification error:', err);
                await supabase.auth.signOut();
                window.location.href = 'Login.html';
            }
        }

        // Fetch metrics using custom RPC functions or fallback counts
        async function loadDashboardStats() {
            try {
                // Fetch Total Members using the get_total_members RPC function
                const { data: totalMembers, error: errTotal } = await client.rpc('get_total_members');
                if (errTotal) throw errTotal;
                document.getElementById('total-members').innerText = Number(totalMembers).toLocaleString();

                // Fetch New Signups (Week) using get_new_signups_this_week
                const { data: signupsThisWeek, error: errThisWeek } = await client.rpc('get_new_signups_this_week');
                if (errThisWeek) throw errThisWeek;
                document.getElementById('new-signups').innerText = Number(signupsThisWeek).toLocaleString();

                // Fetch New Signups last week (for comparison)
                const { data: signupsLastWeek, error: errLastWeek } = await client.rpc('get_new_signups_last_week');
                if (!errLastWeek) {
                    const diff = signupsThisWeek - signupsLastWeek;
                    const percent = signupsLastWeek > 0 ? Math.round((diff / signupsLastWeek) * 100) : 0;
                    const signText = diff >= 0 ? `+${percent}%` : `${percent}%`;
                    const statusText = diff >= 0 ? 'from last week' : 'from last week';
                    const icon = document.querySelector('#new-signups-container span.material-symbols-outlined');
                    if (icon) {
                        icon.innerText = diff >= 0 ? 'arrow_upward' : 'arrow_downward';
                    }
                    const subtext = document.getElementById('new-signups-subtext');
                    if (subtext) {
                        subtext.innerText = `${signText} ${statusText}`;
                    }
                }
            } catch (err) {
                console.error('Error fetching dashboard stats from Supabase:', err);
                
                // Graceful fallback to querying directly if RPCs are missing or fail
                const { count: totalCount, error: errCount } = await client
                    .from('members')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'active');
                
                if (!errCount) {
                    document.getElementById('total-members').innerText = Number(totalCount).toLocaleString();
                }
                
                const { count: signupCount, error: errSignupCount } = await client
                    .from('members')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'active')
                    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

                if (!errSignupCount) {
                    document.getElementById('new-signups').innerText = Number(signupCount).toLocaleString();
                    const subtext = document.getElementById('new-signups-subtext');
                    if (subtext) {
                        subtext.innerText = 'Past 7 days';
                    }
                }
            }
        }

        // Fetch and render the activity log from Supabase
        async function loadActivityLog() {
            const activityList = document.getElementById('activity-list');
            if (!activityList) return;

            try {
                // Query the activity_log table (join members if needed, or query activity_log directly)
                const { data: logs, error } = await client
                    .from('activity_log')
                    .select(`
                        id,
                        action,
                        description,
                        created_at,
                        members (
                            name,
                            surname,
                            role
                        )
                    `)
                    .order('created_at', { ascending: false })
                    .limit(10);

                if (error) throw error;

                if (!logs || logs.length === 0) {
                    activityList.innerHTML = `
                        <div class="px-space-lg py-space-md text-center text-on-surface-variant font-body-md">
                            No recent activities logged in the system.
                        </div>
                    `;
                    return;
                }

                activityList.innerHTML = logs.map(log => {
                    const timeAgo = formatTimeAgo(new Date(log.created_at));
                    let userName = 'System';
                    if (log.members) {
                        userName = `${log.members.name} ${log.members.surname}`;
                    }

                    // Choose icon and bg color based on action type
                    let icon = 'info';
                    let bgClass = 'bg-primary-container text-on-primary-container';
                    const actionLower = log.action.toLowerCase();
                    
                    if (actionLower.includes('signup') || actionLower.includes('member')) {
                        icon = 'person_add';
                        bgClass = 'bg-primary-container text-on-primary-container';
                    } else if (actionLower.includes('email') || actionLower.includes('campaign')) {
                        icon = 'mail';
                        bgClass = 'bg-tertiary-container text-on-tertiary-container';
                    } else if (actionLower.includes('update') || actionLower.includes('pillar') || actionLower.includes('setting')) {
                        icon = 'campaign';
                        bgClass = 'bg-secondary-container text-on-secondary-container';
                    }

                    return `
                        <div class="px-space-lg py-space-md flex items-center justify-between hover:bg-surface-container-low transition-colors">
                            <div class="flex items-center gap-space-md">
                                <div class="w-10 h-10 rounded-full ${bgClass} flex items-center justify-center">
                                    <span class="material-symbols-outlined text-[20px]" data-icon="${icon}">${icon}</span>
                                </div>
                                <div>
                                    <p class="font-body-md text-body-md text-on-surface">
                                        <span class="font-semibold">${userName}</span> ${log.action}
                                    </p>
                                    <p class="font-label-sm text-label-sm text-on-surface-variant">${log.description || ''}</p>
                                </div>
                            </div>
                            <span class="font-label-sm text-label-sm text-on-surface-variant">${timeAgo}</span>
                        </div>
                    `;
                }).join('');

            } catch (err) {
                console.error('Error loading activity logs:', err);
                activityList.innerHTML = `
                    <div class="px-space-lg py-space-md text-center text-on-surface-variant font-body-md">
                        Failed to load live activities. Please verify your connection.
                    </div>
                `;
            }
        }

        // Utility to format timestamp to human readable relative time
        function formatTimeAgo(date) {
            const seconds = Math.floor((new Date() - date) / 1000);
            
            let interval = Math.floor(seconds / 31536000);
            if (interval >= 1) return interval + " years ago";
            
            interval = Math.floor(seconds / 2592000);
            if (interval >= 1) return interval + " months ago";
            
            interval = Math.floor(seconds / 86400);
            if (interval >= 1) return interval + " days ago";
            
            interval = Math.floor(seconds / 3600);
            if (interval >= 1) return interval + (interval === 1 ? " hour ago" : " hours ago");
            
            interval = Math.floor(seconds / 60);
            if (interval >= 1) return interval + (interval === 1 ? " minute ago" : " minutes ago");
            
            return seconds < 10 ? "Just now" : Math.floor(seconds) + " seconds ago";
        }

        // Simple micro-interaction for stats cards
        document.querySelectorAll('.rounded-xl.border').forEach(card => {
            card.addEventListener('mouseenter', () => {
                card.style.borderColor = '#1B5E20';
            });
            card.addEventListener('mouseleave', () => {
                card.style.borderColor = '#E0E0E0';
            });
        });

        // Current navigation state handling logic
        // This simulates picking "Home" as the active state for the dashboard
        const navItems = document.querySelectorAll('aside nav a');
        navItems.forEach(item => {
            if (item.textContent.trim() === 'Home') {
                // Already styled in HTML as per requirements
            }
        });

        // Wire up security and signout triggers
        window.addEventListener('DOMContentLoaded', () => {
            checkAuth();

            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', async () => {
                    await client.auth.signOut();
                    window.location.href = 'Login.html';
                });
            }
        });

        function goToCreateCampaign(){
            window.location.href = 'CreateCampaign.html';
        }
        function goToCreateBlog(){
            window.location.href = 'CreateBlog.html';
        
        }
    }

   
if (window.location.pathname === '/CreateBlog.html') {

  // Hover effect for file upload areas
  const uploadAreas = document.querySelectorAll('.border-dashed');
  uploadAreas.forEach(area => {
    area.addEventListener('mouseenter', () => area.style.borderColor = '#00450d');
    area.addEventListener('mouseleave', () => area.style.borderColor = '#BDBDBD');
  });

  // Preview setup
  function setupImagePreview(divId, inputId) {
    const div = document.getElementById(divId);
    const input = document.getElementById(inputId);

    div.addEventListener('click', () => input.click());

    input.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const previewUrl = URL.createObjectURL(file);
      div.innerHTML = `<img src="${previewUrl}" 
                          class="max-h-40 mx-auto rounded-lg" 
                          alt="Selected image preview" />`;
    });
  }

  setupImagePreview('MainImageDiv', 'MainImage');
  setupImagePreview('img2div', 'img2');
  setupImagePreview('img3div', 'img3');

  // Upload helper
  async function uploadImage(file) {
    if (!file) return null;

    const filePath = `${Date.now()}-${file.name}`;
    const { data, error } = await client.storage
      .from('Blog_Images')
      .upload(filePath, file);

    if (error) {
      console.error("Upload error:", error.message);
      return null;
    }

    const { data: publicUrl } = client.storage
      .from('Blog_Images')
      .getPublicUrl(filePath);

    return publicUrl.publicUrl;
    console.log(publicUrl)
  }
  

  // Submit handler
  async function handleBlogFormSubmit() {
    const title = document.getElementById('title').value;
    const subtitle = document.getElementById('subtitle').value;
    const tagline = document.getElementById('tagline').value;
    const paragraph1 = document.getElementById('paragraph1').value;
    let paragraph2 = null;
    let published = null;
    if(document.getElementById('published')){
        IspublishedNow = document.getElementById('published').value;
        if(IspublishedNow === 'Now'){
            published = true;
        }
        else{
            published = false;
        }
    }
    if (document.getElementById('paragraph2').value) {
      paragraph2 = document.getElementById('paragraph2').value;
    }
    const category = document.getElementById('category').value;
    const mainImage = document.getElementById('MainImage').files[0];
    const img2 = document.getElementById('img2').files[0];
    const img3 = document.getElementById('img3').files[0];
    const img2Label = document.getElementById('img2Label').value;
    const img3Label = document.getElementById('img3Label').value;

    // Get user
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError) {
      console.error('Getting user error: ' + userError.message);
      return;
    }

    // Upload images
    const mainImageURL = await uploadImage(mainImage);
    const img2URL = await uploadImage(img2);
    const img3URL = await uploadImage(img3);

    // Insert blog
    const { data: blog, error: blogError } = await client
      .from('blogs')
      .insert([{
        created_by: user.id, // or user.email depending on schema
        title,
        subtitle,
        tagline,
        featured_image: mainImageURL,
        paragraph1,
        paragraph2,
        category,
        img2Label,
        img3Label
      }])
      .select()
      .single();

    if (blogError) {
      console.error('Blog insert error: ' + blogError.message);
      return;
    }

    // Insert images
    const { error: imagesError } = await client
      .from('blog_images')
      .insert([
        { blog_id: blog.id, image_url: mainImageURL },
        { blog_id: blog.id, image_url: img2URL },
        { blog_id: blog.id, image_url: img3URL }
      ]);

    if (imagesError) {
      console.error('Image insert error: ' + imagesError.message);
    } else {
      console.log('Blog + images uploaded successfully!');
      alert('Post submitted for final review!');
      document.getElementById('blogForm').reset();
    }
  }

  // Hook up submit button
  document.getElementById('BtnSubmit').addEventListener('click', (e) => {
    e.preventDefault();
    handleBlogFormSubmit();
  });
}
     

if(window.location.pathname.includes('viewBlog.html')){
    


    async function loadBlog() {
    const params = new URLSearchParams(window.location.search);
    const blogId = params.get("id");
    if (!blogId) {
      console.error("No blog ID provided");
      return;
    }

    // Fetch main blog row
    const { data: blog, error: blogError } = await clientBlog
      .from("blogs")
      .select("*")
      .eq("id", blogId)
      .single();

    if (blogError) {
      console.error("Error fetching blog:", blogError.message);
      return;
    }
    

    if(blog.published === false){
        document.getElementById('UnpublishButton').style.display = 'none';
    }
    else {
        document.getElementById('UnpublishButton').style.display = 'flex';  
        document.getElementById('PublishButton').style.display = 'none'
    }

    // Fetch related blog_images row(s)
    const { data: blogImages, error: imgError } = await clientBlog
      .from("blog_images")
      .select("*")
      .eq("blog_id", blogId)
    

    if (imgError) {
      console.error("Error fetching blog images:", imgError.message);
      return;
    }

    

    // Map data into your HTML structure
    
    
    document.getElementById("title").textContent = blog.title;
    document.getElementById("subtitle").textContent = blog.subtitle;
    document.getElementById("Category").textContent = blog.category;
    document.getElementById("Date").textContent = new Date(blog.created_at).toLocaleDateString();

    // Featured image
    const featuredContainer = document.getElementById("featured_image");
    featuredContainer.querySelector("img").src = blog.featured_image;

    // Paragraphs and tagline
    document.getElementById("paragraph1").textContent = blog.paragraph1;
    document.getElementById("paragraph2").textContent = blog.paragraph2;
    document.getElementById("tagline").textContent = blog.tagline;

    // Image gallery
    const img2 = document.getElementById("img2Label");
    
    img2.textContent = blog.img2Label;

    const img3 = document.getElementById("img3Label");
    
    img3.textContent = blog.img3Label;

    blogImages.forEach((img, index) => {
    if (index === 0) {
    img2.previousElementSibling.querySelector("img").src = img.image_url;
        }
        if (index === 1) {  
            img3.previousElementSibling.querySelector("img").src = img.image_url;
        }
        });

        
       
  }

  loadBlog();
 

  const role = localStorage.getItem('role');

    console.log(role);
    if(role !== 'admin'){
        document.getElementById('AdminButtons').style.display = 'none';
        console.log('user is not an admin')
    }
    else{
        document.getElementById('AdminButtons').style.display = 'flex';
        
    }

}
function goToBlogs(){
        window.location.href = 'Blogs.html';
    }
function goToCampaigns(){
  window.location.href = 'Campaigns.html';
}
const params = new URLSearchParams(window.location.search);
const blogID = params.get("id");
console.log(blogID);
console.log('the blod id is '+blogID)
     async function UnpublishBlog(){
        const {data: user, error: UnpublishError} = await clientBlog
        .from("blogs")
        .update({ published: false })
        .eq("id", blogID)
        if(UnpublishError){
        window.alert('Failed to Unpublish, please contact your administrator')
    }
    else{
    window.alert('Blog Unpublished')
    document.getElementById('UnpublishButton').style.display = 'none';
    document.getElementById('PublishButton').style.display = 'flex';
    }
}

    
        async function PublishBlog(){
        const {data: user, error: PublishError} = await clientBlog
        .from("blogs")
        .update({ published: true })
        .eq("id", blogID)
        if(PublishError){
        window.alert('Failed to Publish, please contact your administrator')
        
    }
    else {
    window.alert('Blog Published')
    document.getElementById('UnpublishButton').style.display = 'flex';
    document.getElementById('PublishButton').style.display = 'none';
    }
    }   
    async function DeleteBlog(){
          const confirmDelete = window.confirm("Are you sure you want to delete this blog?");
    if (!confirmDelete) {
    return; // user clicked Cancel
  }
        const {data: blog, error: DeleteError} = await clientBlog
        .from("blogs")
        .delete()
        .eq("id", blogID)
        if(DeleteError){
            window.alert('Failed to Delete, please contact your administrator')
        }
        else{
            window.alert('Blog Deleted')
            window.location.href = 'Blogs.html';
        }
    }

    function goToEditForm(){
        window.location.href = `CreateBlog.html?blogID=${blogID}`;
    }

if(window.location.pathname.includes('CreateBlog.html') && window.location.search.includes('blogID=')){
    console.log('running')

    const params = new URLSearchParams(window.location.search);
    const EditID = params.get("blogID");
    console.log(EditID);
    console.log('the blog id is '+EditID)
    async function LoadEditForm() {
    const {data: blog, error: LoadingblogError} = await clientBlog
        .from("blogs")
        .select("*")
        .eq("id", EditID)
        .single();

        if(LoadingblogError){
    console.log(LoadingblogError.message)
   }
   else{
    document.getElementById('title').value = blog.title;
    document.getElementById('subtitle').value = blog.subtitle;
    document.getElementById('tagline').value = blog.tagline;
    document.getElementById('paragraph1').value = blog.paragraph1;
    document.getElementById('paragraph2').value = blog.paragraph2;
    document.getElementById('category').value = blog.category;
    document.getElementById('img2Label').value = blog.img2Label;
    document.getElementById('img3Label').value = blog.img3Label;
    
    }
       const {data: blogImages, error: imgError} = await clientBlog
   .from('blog_images')
   .select('*')
   .eq('blog_id', EditID)

   let img2URL = blogImages[0].image_url;
   let img3URL = blogImages[1].image_url;




// Inject preview into the div
const MainImageDiv = document.getElementById('MainImageDiv');
MainImageDiv.innerHTML = `
  <img src="${blog.featured_image}" alt="Image 2 preview" class="mx-auto max-h-40 rounded" />
`;

const img2Div = document.getElementById('img2div');
img2Div.innerHTML = `
  <img src="${img2URL}" alt="Image 2 preview" class="mx-auto max-h-40 rounded" />
`;


// Inject preview into the div
const img3Div = document.getElementById('img3div');
img3Div.innerHTML = `
  <img src="${img3URL}" alt="Image 2 preview" class="mx-auto max-h-40 rounded" />
`;
   }


   
   
LoadEditForm();

}

// ═════════════════════════════════════════════════════════════════════════════
// CREATE CAMPAIGN PAGE LOGIC
// ═════════════════════════════════════════════════════════════════════════════

if (window.location.pathname.includes('CreateCampaign.html')) {

  // ── State ──────────────────────────────────────────────────────────────────
  let currentCampaignId = null;
  let bannerFile = null;           // The File object (not uploaded yet)
  let bannerPreviewUrl = null;     // Local blob URL for preview
  let bannerPublicUrl = null;      // Supabase Storage public URL (after upload)
  let isSendToAll = false;
  let selectedMunicipalities = [];
  let adminEmail = null;
  let adminName = 'Admin';

  // ── Init ───────────────────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadMunicipalities();
    await checkResendStatus();
    setupLivePreview();
    setupRichTextEditor();
    setupToggleSwitch();
    setupDeploymentType();
    setupBannerUpload();
    setupCharCounter();

    // Prefill sender name from admin profile
    const { data: { session } } = await client.auth.getSession();
    if (session) {
      const { data: member } = await client
        .from('members')
        .select('name, surname, email')
        .eq('email', session.user.email)
        .maybeSingle();
      if (member) {
        adminName = `${member.name || ''} ${member.surname || ''}`.trim() || 'Admin';
        adminEmail = member.email;
        const senderNameInput = document.getElementById('sender-name');
        if (senderNameInput && !senderNameInput.value.trim()) {
          senderNameInput.value = adminName;
        }
      }
    }
  });

  // ── Auth ───────────────────────────────────────────────────────────────────
  async function checkAuth() {
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) {
      window.location.href = 'Login.html';
      return;
    }
    const { data: member, error: memberError } = await client
      .from('members')
      .select('role, name')
      .eq('email', session.user.email)
      .maybeSingle();
    if (memberError || !member || member.role !== 'admin') {
      await client.auth.signOut();
      window.location.href = 'Login.html';
      return;
    }
    document.getElementById('AdminName').textContent = member.name || 'Admin';
  }

  // ── Resend Status ──────────────────────────────────────────────────────────
  async function checkResendStatus() {
    const dot = document.getElementById('resend-dot');
    const text = document.getElementById('resend-status-text');
    try {
      const { data: { session } } = await client.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/send-campaign`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseKey,
        },
      });
      if (res.ok) {
        dot.className = 'w-2 h-2 bg-primary rounded-full';
        text.textContent = 'Connected';
        text.classList.add('text-primary');
      } else {
        throw new Error('Health check failed');
      }
    } catch (err) {
      dot.className = 'w-2 h-2 bg-error rounded-full';
      text.textContent = 'Disconnected';
      text.classList.add('text-error');
    }
  }

  // ── Load Municipalities ─────────────────────────────────────────────────────
  async function loadMunicipalities() {
    const container = document.getElementById('ward-chips-container');
    try {
      const { data: municipalities, error } = await client
        .from('members')
        .select('municipality')
        .not('municipality', 'is', null)
        .eq('status', 'active');

      if (error) throw error;

      const distinct = [...new Set(municipalities.map(m => m.municipality).filter(Boolean))].sort();

      if (distinct.length === 0) {
        container.innerHTML = '<p class="text-on-surface-variant font-label-sm text-label-sm py-1">No municipalities found.</p>';
        return;
      }

      container.innerHTML = distinct.map(munic => `
        <label class="ward-chip cursor-pointer">
          <input type="checkbox" value="${munic}" class="hidden" onchange="handleMunicipalityToggle(this)">
          <div class="px-3 py-1.5 rounded-lg border border-border-subtle bg-white text-body-md text-on-surface hover:bg-surface-container transition-all select-none">
            ${munic}
          </div>
        </label>
      `).join('');

      await updateAudienceCount();
    } catch (err) {
      console.error('Error loading municipalities:', err);
      container.innerHTML = '<p class="text-error font-label-sm text-label-sm py-1">Failed to load municipalities.</p>';
    }
  }

  // ── Municipality Toggle ─────────────────────────────────────────────────────
  window.handleMunicipalityToggle = async function(checkbox) {
    const val = checkbox.value;
    if (checkbox.checked) {
      if (!selectedMunicipalities.includes(val)) selectedMunicipalities.push(val);
    } else {
      selectedMunicipalities = selectedMunicipalities.filter(m => m !== val);
    }
    await updateAudienceCount();
  };

  // ── Send to All Toggle ──────────────────────────────────────────────────────
  function setupToggleSwitch() {
    const toggle = document.getElementById('toggleSwitch');
    const hint = document.getElementById('ward-hint');

    if (!toggle) {
      console.error('toggleSwitch element not found in DOM');
      return;
    }
    if (!hint) {
      console.error('ward-hint element not found in DOM');
      return;
    }

    // Ensure toggle is visible and clickable
    toggle.style.cursor = 'pointer';
    toggle.style.display = 'inline-block';

    toggle.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      isSendToAll = !isSendToAll;
      const knob = toggle.querySelector('span');

      if (isSendToAll) {
        // ON state: green background, knob moved right
        toggle.classList.remove('bg-border-subtle', 'bg-gray-300');
        toggle.classList.add('bg-primary');
        if (knob) {
          knob.classList.add('translate-x-4');
          knob.classList.remove('translate-x-0');
        }
        // Disable all ward chips
        document.querySelectorAll('.ward-chip input').forEach(cb => {
          cb.checked = false;
          cb.disabled = true;
          const div = cb.parentElement.querySelector('div');
          if (div) div.classList.add('opacity-40', 'cursor-not-allowed');
        });
        selectedMunicipalities = [];
        hint.textContent = 'All active email subscribers will receive this campaign.';
        hint.classList.add('text-primary', 'font-semibold');
      } else {
        // OFF state: gray background, knob left
        toggle.classList.add('bg-border-subtle');
        toggle.classList.remove('bg-primary');
        if (knob) {
          knob.classList.remove('translate-x-4');
          knob.classList.add('translate-x-0');
        }
        // Enable ward chips
        document.querySelectorAll('.ward-chip input').forEach(cb => {
          cb.disabled = false;
          const div = cb.parentElement.querySelector('div');
          if (div) div.classList.remove('opacity-40', 'cursor-not-allowed');
        });
        hint.textContent = 'Select one or more wards/municipalities to target, or use "Send to All".';
        hint.classList.remove('text-primary', 'font-semibold');
      }

      await updateAudienceCount();
    });

    console.log('Toggle switch initialized successfully');
  }

  // ── Audience Count ───────────────────────────────────────────────────────────
  async function updateAudienceCount() {
    const countBadge = document.getElementById('audience-count');
    const statSubscribers = document.getElementById('stat-subscribers');
    const statActive = document.getElementById('stat-active');
    const statWillReceive = document.getElementById('stat-will-receive');
    const barSubscribers = document.getElementById('bar-subscribers');
    const barActive = document.getElementById('bar-active');

    try {
      let query = client
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('wants_emails', true)
        .eq('status', 'active')
        .not('email', 'is', null);

      if (!isSendToAll && selectedMunicipalities.length > 0) {
        query = query.in('municipality', selectedMunicipalities);
      }

      const { count, error } = await query;
      if (error) throw error;

      const totalSubscribers = count || 0;

      const { count: totalActive, error: activeErr } = await client
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      const activeCount = activeErr ? 0 : (totalActive || 0);

      countBadge.textContent = totalSubscribers.toLocaleString();
      statSubscribers.textContent = totalSubscribers.toLocaleString();
      statActive.textContent = activeCount.toLocaleString();
      statWillReceive.textContent = totalSubscribers.toLocaleString();

      const max = Math.max(totalSubscribers, activeCount, 1);
      barSubscribers.style.width = `${(totalSubscribers / max) * 100}%`;
      barActive.style.width = `${(activeCount / max) * 100}%`;
    } catch (err) {
      console.error('Audience count error:', err);
      countBadge.textContent = '—';
    }
  }

  // ── Deployment Type ─────────────────────────────────────────────────────────
  function setupDeploymentType() {
    const select = document.getElementById('deployment-type');
    const wrapper = document.getElementById('schedule-datetime-wrapper');
    select.addEventListener('change', () => {
      if (select.value === 'scheduled') {
        wrapper.classList.remove('hidden');
      } else {
        wrapper.classList.add('hidden');
      }
    });
  }

  // ── Banner Upload (Local Preview Only) ─────────────────────────────────────
  function setupBannerUpload() {
    const input = document.getElementById('banner-input');
    const dropZone = document.getElementById('banner-drop-zone');
    const placeholder = document.getElementById('banner-placeholder');
    const previewContainer = document.getElementById('banner-preview-container');
    const previewImg = document.getElementById('banner-preview-img');

    // Drag & drop visual feedback
    ['dragenter', 'dragover'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.add('banner-drag-active');
      });
    });
    ['dragleave', 'drop'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.remove('banner-drag-active');
      });
    });
    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length) handleBannerSelect(files[0]);
    });

    input.addEventListener('change', (e) => {
      if (e.target.files.length) handleBannerSelect(e.target.files[0]);
    });

    function handleBannerSelect(file) {
      if (!file.type.startsWith('image/')) {
        showToast('Please upload an image file (PNG, JPG, WEBP).', 'error');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        showToast('Image must be under 2MB.', 'error');
        return;
      }

      // Store file for later upload
      bannerFile = file;

      // Create local preview URL
      if (bannerPreviewUrl) URL.revokeObjectURL(bannerPreviewUrl);
      bannerPreviewUrl = URL.createObjectURL(file);

      // Update upload zone UI
      placeholder.classList.add('hidden');
      previewContainer.classList.remove('hidden');
      previewImg.src = bannerPreviewUrl;

      // Update email preview panel
      const previewBannerImg = document.getElementById('preview-banner-img');
      const previewBannerPlaceholder = document.getElementById('preview-banner-placeholder');
      if (previewBannerImg && previewBannerPlaceholder) {
        previewBannerImg.src = bannerPreviewUrl;
        previewBannerImg.classList.remove('hidden');
        previewBannerPlaceholder.classList.add('hidden');
      }

      showToast('Banner selected. Will upload when you save or launch.', 'success');
    }
  }

  // ── Remove Banner ──────────────────────────────────────────────────────────
  window.removeBanner = function(e) {
    if (e) e.stopPropagation();

    // Revoke local preview URL to free memory
    if (bannerPreviewUrl) {
      URL.revokeObjectURL(bannerPreviewUrl);
      bannerPreviewUrl = null;
    }

    // Clear file reference
    bannerFile = null;
    bannerPublicUrl = null;

    // Reset UI
    document.getElementById('banner-placeholder').classList.remove('hidden');
    document.getElementById('banner-preview-container').classList.add('hidden');
    document.getElementById('banner-preview-img').src = '';
    document.getElementById('banner-input').value = '';

    const previewBannerImg = document.getElementById('preview-banner-img');
    const previewBannerPlaceholder = document.getElementById('preview-banner-placeholder');
    if (previewBannerImg && previewBannerPlaceholder) {
      previewBannerImg.classList.add('hidden');
      previewBannerImg.src = '';
      previewBannerPlaceholder.classList.remove('hidden');
    }
  };

  // ── Upload Banner to Supabase Storage (called on save/launch only) ─────────
  async function uploadBanner() {
    if (!bannerFile) return null;

    try {
      const filePath = `campaigns/${Date.now()}-${bannerFile.name}`;
      const { data, error } = await client.storage
        .from('Campaign_Banners')
        .upload(filePath, bannerFile, { contentType: bannerFile.type });

      if (error) throw error;

      const { data: publicUrlData } = client.storage
        .from('Campaign_Banners')
        .getPublicUrl(filePath);

      bannerPublicUrl = publicUrlData.publicUrl;

      // Update preview to use public URL (so it persists after blob is revoked)
      const previewBannerImg = document.getElementById('preview-banner-img');
      if (previewBannerImg) previewBannerImg.src = bannerPublicUrl;

      return bannerPublicUrl;
    } catch (err) {
      console.error('Banner upload error:', err);
      showToast('Failed to upload banner to storage.', 'error');
      throw err;
    }
  }

  // ── Rich Text Editor ───────────────────────────────────────────────────────
  function setupRichTextEditor() {
    const editor = document.getElementById('email-body-editor');
    editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  }

  window.execCmd = function(command) {
    document.execCommand(command, false, null);
    document.getElementById('email-body-editor').focus();
  };

  window.insertLink = function() {
    const url = prompt('Enter the URL:');
    if (url) {
      document.execCommand('createLink', false, url);
      document.getElementById('email-body-editor').focus();
    }
  };

  // ── Character Counter ──────────────────────────────────────────────────────
  function setupCharCounter() {
    const editor = document.getElementById('email-body-editor');
    const counter = document.getElementById('char-count');
    editor.addEventListener('input', () => {
      const text = editor.innerText || '';
      counter.textContent = `${text.length} chars`;
    });
  }

  // ── Live Preview ─────────────────────────────────────────────────────────────
  function setupLivePreview() {
    const titleInput = document.getElementById('campaign-title');
    const subjectInput = document.getElementById('campaign-subject');
    const previewTextInput = document.getElementById('campaign-preview-text');
    const senderNameInput = document.getElementById('sender-name');
    const editor = document.getElementById('email-body-editor');

    const previewTitle = document.getElementById('preview-title');
    const previewSubjectMeta = document.getElementById('preview-subject-meta');
    const previewSenderDisplay = document.getElementById('preview-sender-display');
    const previewSenderFooter = document.getElementById('preview-sender-footer');
    const previewBody = document.getElementById('preview-body-content');

    const update = () => {
      if (previewTitle) previewTitle.textContent = titleInput.value.trim() || 'Untitled Campaign';
      if (previewSubjectMeta) previewSubjectMeta.textContent = subjectInput.value.trim() ? '← ' + subjectInput.value.trim() : '← subject appears here';
      if (previewSenderDisplay) previewSenderDisplay.textContent = senderNameInput.value.trim() || 'ASIHLANGANENI CIVIC MOVEMENT';
      if (previewSenderFooter) previewSenderFooter.textContent = senderNameInput.value.trim() || 'ASIHLANGANENI CIVIC MOVEMENT';

      const bodyHtml = editor.innerHTML.trim();
      if (previewBody) {
        if (bodyHtml && bodyHtml !== '<br>') {
          previewBody.innerHTML = bodyHtml;
        } else {
          previewBody.innerHTML = '<p><em>Your email body will appear here as you type...</em></p>';
        }
      }
    };

    titleInput.addEventListener('input', update);
    subjectInput.addEventListener('input', update);
    previewTextInput.addEventListener('input', update);
    senderNameInput.addEventListener('input', update);
    editor.addEventListener('input', update);

    update();
  }

  // ── Toast System ─────────────────────────────────────────────────────────────
  window.showToast = function(message, type = 'success') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toast-icon');
    const msg = document.getElementById('toast-message');

    msg.textContent = message;
    if (type === 'success') {
      toast.className = 'fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl max-w-sm bg-primary text-on-primary show';
      icon.textContent = 'check_circle';
    } else if (type === 'error') {
      toast.className = 'fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl max-w-sm bg-error text-on-error show';
      icon.textContent = 'error';
    } else {
      toast.className = 'fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl max-w-sm bg-surface-container-high text-on-surface show';
      icon.textContent = 'info';
    }

    setTimeout(() => hideToast(), 4000);
  };

  window.hideToast = function() {
    const toast = document.getElementById('toast');
    toast.classList.remove('show');
  };

  // ── Loading Overlay ─────────────────────────────────────────────────────────
  function showLoading(text = 'Sending Campaign...', sub = 'Please wait while we reach your members.') {
    const overlay = document.getElementById('loading-overlay');
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading-sub').textContent = sub;
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
  }

  function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
  }

  // ── Form Validation ─────────────────────────────────────────────────────────
  function validateCampaign() {
    const title = document.getElementById('campaign-title').value.trim();
    const subject = document.getElementById('campaign-subject').value.trim();
    const body = document.getElementById('email-body-editor').innerText.trim();

    if (!title) return 'Campaign title is required.';
    if (!subject) return 'Email subject line is required.';
    if (!body) return 'Email body content is required.';

    const deploymentType = document.getElementById('deployment-type').value;
    if (deploymentType === 'scheduled') {
      const scheduled = document.getElementById('schedule-datetime').value;
      if (!scheduled) return 'Please select a scheduled date and time.';
      if (new Date(scheduled) <= new Date()) return 'Scheduled time must be in the future.';
    }

    if (!isSendToAll && selectedMunicipalities.length === 0) {
      return 'Please select at least one municipality, or enable "Send to All".';
    }

    return null;
  }

  // ── Collect Campaign Data ───────────────────────────────────────────────────
  function collectCampaignData() {
    return {
      title: document.getElementById('campaign-title').value.trim(),
      subject_line: document.getElementById('campaign-subject').value.trim(),
      preview_text: document.getElementById('campaign-preview-text').value.trim(),
      sender_name: document.getElementById('sender-name').value.trim(),
      sender_email: document.getElementById('sender-email').value.trim(),
      text: document.getElementById('email-body-editor').innerHTML,
      banner_url: bannerPublicUrl,
      campaign_type: document.getElementById('campaign-type').value,
      target_type: isSendToAll ? 'all_members' : 'ward',
      scheduled_for: document.getElementById('deployment-type').value === 'scheduled'
        ? new Date(document.getElementById('schedule-datetime').value).toISOString()
        : null,
      status: 'draft',
    };
  }

  // ── Save Draft ──────────────────────────────────────────────────────────────
  window.saveDraft = async function(options = {}) {
    const silent = options.silent || false;
    const data = collectCampaignData();
    if (!data.title) {
      showToast('Please enter at least a campaign title to save a draft.', 'error');
      return;
    }

    showLoading('Saving Draft...', 'Storing your campaign securely.');

    try {
      // Upload banner first if selected
      if (bannerFile && !bannerPublicUrl) {
        await uploadBanner();
        data.banner_url = bannerPublicUrl;
      }

      const { data: { session } } = await client.auth.getSession();

      const upsertData = {
        ...data,
        updated_at: new Date().toISOString(),
      };
      if (currentCampaignId) upsertData.id = currentCampaignId;

      const { data: campaign, error: campaignError } = await client
        .from('campaigns')
        .upsert(upsertData)
        .select()
        .single();

      if (campaignError) throw campaignError;

      currentCampaignId = campaign.id;

      // Save targets
      // Always clear old targets first
      await client.from('campaign_targets').delete().eq('campaign_id', currentCampaignId);

      if (!isSendToAll && selectedMunicipalities.length > 0) {
        // Store each municipality as a 'ward' target with the name in municipality column
        const targetRows = selectedMunicipalities.map(m => ({
          campaign_id: currentCampaignId,
          target_type: 'ward',
          municipality: m,
          ward_id: null,
          branch_id: null,
        }));
        const { error: targetsError } = await client.from('campaign_targets').insert(targetRows);
        if (targetsError) throw targetsError;
      }
      // If isSendToAll, we don't insert any campaign_targets rows at all
      // The campaigns.target_type = 'all_members' handles that

      document.getElementById('campaign-id-card').classList.remove('hidden');
      document.getElementById('campaign-id-display').textContent = currentCampaignId;
      document.getElementById('campaign-status-display').textContent = 'Draft';

      if (!silent) {
        const indicator = document.getElementById('draft-saved-indicator');
        indicator.classList.remove('hidden');
        setTimeout(() => indicator.classList.add('hidden'), 3000);
      }

      if (!silent) showToast('Draft saved successfully.', 'success');
    } catch (err) {
      console.error('Save draft error:', err);
      showToast('Failed to save draft: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  };

  // ── Send Test Email ─────────────────────────────────────────────────────────
  window.sendTestEmail = async function() {
    const error = validateCampaign();
    if (error) {
      showToast(error, 'error');
      return;
    }

    if (!adminEmail) {
      showToast('Could not determine admin email. Please re-login.', 'error');
      return;
    }

    showLoading('Sending Test...', 'Delivering preview to your inbox.');

    try {
      // Upload banner first if selected (test email needs the public URL)
      let testBannerUrl = bannerPublicUrl;
      if (bannerFile && !bannerPublicUrl) {
        testBannerUrl = await uploadBanner();
      }

      const { data: { session } } = await client.auth.getSession();
      const campaignData = collectCampaignData();
      campaignData.banner_url = testBannerUrl || campaignData.banner_url;

      const res = await fetch(`${supabaseUrl}/functions/v1/send-campaign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
        },
        body: JSON.stringify({
          test_mode: true,
          test_email: adminEmail,
          campaign_data: campaignData,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Test send failed');

      showToast(`Test email sent to ${adminEmail}`, 'success');
    } catch (err) {
      console.error('Test email error:', err);
      showToast('Failed to send test: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  };

  // ── Launch Campaign ───────────────────────────────────────────────────────────
  let isLaunching = false;  // Guard against double-clicks

  window.handleLaunchCampaign = async function() {
    if (isLaunching) {
      showToast('Campaign is already being processed...', 'info');
      return;
    }

    const error = validateCampaign();
    if (error) {
      showToast(error, 'error');
      return;
    }

    const deploymentType = document.getElementById('deployment-type').value;
    const isScheduled = deploymentType === 'scheduled';

    if (!confirm(isScheduled
      ? 'Schedule this campaign to send later?'
      : 'Launch this campaign now? This will send emails to all targeted members.')) {
      return;
    }

    isLaunching = true;
    showLoading(
      isScheduled ? 'Scheduling Campaign...' : 'Launching Campaign...',
      isScheduled ? 'Setting up timed delivery.' : 'Sending emails via Resend.'
    );

    try {
      // Upload banner first if selected
      if (bannerFile && !bannerPublicUrl) {
        await uploadBanner();
      }

      // Save draft and verify it succeeded
      await saveDraft({ silent: true });
      if (!currentCampaignId) {
        throw new Error('Failed to save campaign before sending. Please try again.');
      }

      const newStatus = isScheduled ? 'scheduled' : 'draft';
      const { error: statusError } = await client
        .from('campaigns')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', currentCampaignId);

      if (statusError) throw statusError;

      const { data: { session } } = await client.auth.getSession();
      if (!session) throw new Error('Session expired. Please log in again.');

      const payload = { campaign_id: currentCampaignId };
      if (isScheduled) {
        payload.send_mode = 'scheduled';
        payload.scheduled_for = document.getElementById('schedule-datetime').value;
      } else {
        payload.send_mode = 'now';
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/send-campaign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        // Revert status to draft on failure
        await client.from('campaigns').update({ status: 'draft' }).eq('id', currentCampaignId);
        throw new Error(result.error || 'Campaign launch failed');
      }

      document.getElementById('campaign-status-display').textContent = result.status || (isScheduled ? 'Scheduled' : 'Sent');
      showToast(
        isScheduled
          ? `Campaign scheduled for ${result.message || 'later'}`
          : `Campaign sent to ${result.recipient_count || 'all'} recipients!`,
        'success'
      );

      setTimeout(() => {
        window.location.href = 'Admin.html';
      }, 2500);

    } catch (err) {
      console.error('Launch campaign error:', err);
      showToast('Launch failed: ' + err.message, 'error');
    } finally {
      isLaunching = false;
      hideLoading();
    }
  };

  // ── Discard Campaign ─────────────────────────────────────────────────────────
  window.discardCampaign = function() {
    if (confirm('Are you sure? All unsaved changes will be lost.')) {
      // Revoke blob URL to prevent memory leak
      if (bannerPreviewUrl) {
        URL.revokeObjectURL(bannerPreviewUrl);
        bannerPreviewUrl = null;
      }

      if (currentCampaignId) {
        client.from('campaigns').delete().eq('id', currentCampaignId).then(() => {
          window.location.href = 'Admin.html';
        });
      } else {
        window.location.href = 'Admin.html';
      }
    }
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CAMPAIGNS LIST PAGE LOGIC
// ═════════════════════════════════════════════════════════════════════════════

if (window.location.pathname.includes('Campaigns.html')) {

  // ── State ──────────────────────────────────────────────────────────────────
  let currentTab = 'sent';
  let currentPage = 1;
  const pageSize = 10;
  let totalCampaigns = 0;
  let searchQuery = '';
  let dateFilter = null;

  // ── Init ───────────────────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadKPIs();
    await loadCampaigns();
    setupTabs();
    setupSearch();
    setupDateFilter();
    setupPagination();
    setupLogout();
  });

  // ── Auth ───────────────────────────────────────────────────────────────────
  async function checkAuth() {
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) {
      window.location.href = 'Login.html';
      return;
    }
    const { data: member, error: memberError } = await client
      .from('members')
      .select('role, name')
      .eq('email', session.user.email)
      .maybeSingle();
    if (memberError || !member || member.role !== 'admin') {
      await client.auth.signOut();
      window.location.href = 'Login.html';
      return;
    }
    document.getElementById('AdminName').textContent = member.name || 'Admin';
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  function setupLogout() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await client.auth.signOut();
        window.location.href = 'Login.html';
      });
    }
  }

  // ── Load KPIs ──────────────────────────────────────────────────────────────
  async function loadKPIs() {
    try {
      // Total Sent
      const { count: totalSent, error: sentErr } = await client
        .from('campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent');

      // Total Subscribers (active email subscribers)
      const { count: totalSubscribers, error: subErr } = await client
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('wants_emails', true)
        .eq('status', 'active');

      // Avg Open Rate & Click Rate (across all sent campaigns)
      // First get all sent campaign IDs
      const { data: sentCampaigns, error: sentCampaignsErr } = await client
        .from('campaigns')
        .select('id')
        .eq('status', 'sent');

      let stats = [];
      if (sentCampaigns && sentCampaigns.length > 0) {
        const campaignIds = sentCampaigns.map(c => c.id);
        const { data: recipientStats, error: statsErr } = await client
          .from('campaign_recipients')
          .select('open_count, click_count, campaign_id')
          .in('campaign_id', campaignIds);
        if (!statsErr) stats = recipientStats || [];
      }

      let avgOpenRate = 0;
      let avgClickRate = 0;

      if (stats && stats.length > 0) {
        // Group by campaign to calculate per-campaign rates
        const campaignStats = {};
        stats.forEach(row => {
          if (!campaignStats[row.campaign_id]) {
            campaignStats[row.campaign_id] = { total: 0, opened: 0, clicked: 0 };
          }
          campaignStats[row.campaign_id].total++;
          if (row.open_count > 0) campaignStats[row.campaign_id].opened++;
          if (row.click_count > 0) campaignStats[row.campaign_id].clicked++;
        });

        const campaigns = Object.values(campaignStats);
        avgOpenRate = campaigns.reduce((sum, c) => sum + (c.opened / c.total), 0) / campaigns.length * 100;
        avgClickRate = campaigns.reduce((sum, c) => sum + (c.clicked / c.total), 0) / campaigns.length * 100;
      }

      // Update DOM
      updateKPI('kpi-total-sent', totalSent || 0);
      updateKPI('kpi-avg-open', avgOpenRate.toFixed(1) + '%');
      updateKPI('kpi-avg-click', avgClickRate.toFixed(1) + '%');
      updateKPI('kpi-total-subscribers', totalSubscribers || 0);

    } catch (err) {
      console.error('KPI load error:', err);
    }
  }

  function updateKPI(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // ── Load Campaigns ─────────────────────────────────────────────────────────
  async function loadCampaigns() {
    try {
      let query = client
        .from('campaigns')
        .select(`
          id, title, subject_line, sent_at, status, recipient_count, scheduled_for,
          campaign_recipients!left (id, open_count, click_count, status)
        `)
        .order('sent_at', { ascending: false })
        .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

      // Apply tab filter
      if (currentTab === 'sent') query = query.eq('status', 'sent');
      else if (currentTab === 'drafts') query = query.eq('status', 'draft');
      else if (currentTab === 'scheduled') query = query.eq('status', 'scheduled');
      else if (currentTab === 'archived') query = query.eq('status', 'archived');

      // Apply search
      if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,subject_line.ilike.%${searchQuery}%`);
      }

      // Apply date filter
      if (dateFilter) {
        query = query.gte('sent_at', dateFilter.start).lte('sent_at', dateFilter.end);
      }

      const { data: campaigns, error, count } = await query;
      if (error) throw error;

      totalCampaigns = count || 0;
      renderCampaignTable(campaigns || []);
      updatePagination();

    } catch (err) {
      console.error('Campaign load error:', err);
      renderEmptyState('Failed to load campaigns. Please try again.');
    }
  }

  // ── Render Table ───────────────────────────────────────────────────────────
  function renderCampaignTable(campaigns) {
    const tbody = document.querySelector('table tbody');
    if (!tbody) return;

    if (campaigns.length === 0) {
      renderEmptyState('No campaigns found.');
      return;
    }

    tbody.innerHTML = campaigns.map(c => {
      // Calculate stats from campaign_recipients
      const recipients = c.campaign_recipients || [];
      const totalRecipients = recipients.length;
      const opened = recipients.filter(r => r.open_count > 0).length;
      const clicked = recipients.filter(r => r.click_count > 0).length;
      const openRate = totalRecipients > 0 ? ((opened / totalRecipients) * 100).toFixed(1) : 0;
      const clickRate = totalRecipients > 0 ? ((clicked / totalRecipients) * 100).toFixed(1) : 0;

      const sentDate = c.sent_at 
        ? new Date(c.sent_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
        : (c.scheduled_for ? 'Scheduled' : 'Draft');

      const statusBadge = getStatusBadge(c.status);

      return `
        <tr class="hover:bg-surface-container-lowest transition-colors group" data-id="${c.id}">
          <td class="px-space-md py-4">
            <div class="font-label-sm text-label-sm font-bold text-on-surface">${c.title || 'Untitled'}</div>
            <div class="text-[11px] text-on-surface-variant">ID: ${c.id.slice(0, 8).toUpperCase()}</div>
          </td>
          <td class="px-space-md py-4 text-body-md text-on-surface-variant truncate max-w-[200px]">${c.subject_line || '—'}</td>
          <td class="px-space-md py-4 text-body-md">${sentDate}</td>
          <td class="px-space-md py-4 text-body-md text-center font-semibold">${totalRecipients.toLocaleString()}</td>
          <td class="px-space-md py-4 text-center">
            <div class="flex flex-col items-center">
              <span class="text-body-md font-semibold">${openRate}%</span>
              <div class="w-16 h-1 bg-surface-container rounded-full mt-1">
                <div class="bg-primary h-full rounded-full transition-all" style="width: ${openRate}%"></div>
              </div>
            </div>
          </td>
          <td class="px-space-md py-4 text-center">
            <div class="flex flex-col items-center">
              <span class="text-body-md font-semibold">${clickRate}%</span>
              <div class="w-16 h-1 bg-surface-container rounded-full mt-1">
                <div class="bg-secondary h-full rounded-full transition-all" style="width: ${clickRate}%"></div>
              </div>
            </div>
          </td>
          <td class="px-space-md py-4">${statusBadge}</td>
          <td class="px-space-md py-4 text-right">
            <div class="relative inline-block">
              <button class="p-1 hover:bg-surface-container rounded text-on-surface-variant action-menu-btn" data-id="${c.id}">
                <span class="material-symbols-outlined text-[20px]">more_vert</span>
              </button>
              <div class="action-menu hidden absolute right-0 mt-1 w-40 bg-white border border-border-subtle rounded-lg shadow-lg z-10">
                ${c.status === 'draft' ? `<a href="CreateCampaign.html?draft=${c.id}" class="block px-4 py-2 text-body-md hover:bg-surface-container-low">Edit & Launch</a>` : ''}
                <a href="#" class="block px-4 py-2 text-body-md hover:bg-surface-container-low view-campaign" data-id="${c.id}">View Details</a>
                ${c.status === 'draft' ? `<button class="block w-full text-left px-4 py-2 text-body-md text-error hover:bg-surface-container-low delete-draft" data-id="${c.id}">Delete Draft</button>` : ''}
              </div>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Wire up action menus
    document.querySelectorAll('.action-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = btn.nextElementSibling;
        document.querySelectorAll('.action-menu').forEach(m => {
          if (m !== menu) m.classList.add('hidden');
        });
        menu.classList.toggle('hidden');
      });
    });

    // Close menus on outside click
    document.addEventListener('click', () => {
      document.querySelectorAll('.action-menu').forEach(m => m.classList.add('hidden'));
    });

    // Wire up view campaign links — navigate to ViewCampaigns.html with the campaign ID
    document.querySelectorAll('.view-campaign').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const id = link.dataset.id;
        if (id) {
          window.location.href = `ViewCampaigns.html?id=${id}`;
        }
      });
    });

    // Wire delete draft buttons
    document.querySelectorAll('.delete-draft').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        if (confirm('Delete this draft permanently?')) {
          await client.from('campaigns').delete().eq('id', id);
          await loadCampaigns();
        }
      });
    });
  }

  function getStatusBadge(status) {
    const badges = {
      sent: '<span class="bg-primary-fixed text-on-primary-fixed-variant px-2 py-1 rounded text-[11px] font-bold">SENT</span>',
      draft: '<span class="bg-surface-container-high text-on-surface-variant px-2 py-1 rounded text-[11px] font-bold">DRAFT</span>',
      scheduled: '<span class="bg-secondary-fixed text-on-secondary-container px-2 py-1 rounded text-[11px] font-bold">SCHEDULED</span>',
      failed: '<span class="bg-error-container text-on-error-container px-2 py-1 rounded text-[11px] font-bold">FAILED</span>',
      archived: '<span class="bg-surface-dim text-on-surface-variant px-2 py-1 rounded text-[11px] font-bold">ARCHIVED</span>',
    };
    return badges[status] || `<span class="bg-surface-container-high text-on-surface-variant px-2 py-1 rounded text-[11px] font-bold">${status.toUpperCase()}</span>`;
  }

  function renderEmptyState(message) {
    const tbody = document.querySelector('table tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr><td colspan="8" class="px-space-md py-8 text-center text-on-surface-variant font-body-md">
          ${message}
        </td></tr>
      `;
    }
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  function setupTabs() {
    const tabs = document.querySelectorAll('button[data-tab]');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        currentTab = tab.dataset.tab;
        currentPage = 1;

        // Update UI
        tabs.forEach(t => {
          t.classList.remove('border-primary', 'text-primary', 'font-bold');
          t.classList.add('border-transparent', 'text-on-surface-variant');
        });
        tab.classList.remove('border-transparent', 'text-on-surface-variant');
        tab.classList.add('border-primary', 'text-primary', 'font-bold');

        loadCampaigns();
      });
    });
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  function setupSearch() {
    const input = document.querySelector('input[placeholder*="Search campaign"]');
    if (!input) return;

    let debounceTimer;
    input.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        searchQuery = e.target.value.trim();
        currentPage = 1;
        loadCampaigns();
      }, 300);
    });
  }

  // ── Date Filter ────────────────────────────────────────────────────────────
  function setupDateFilter() {
    // Find the date filter button by looking for calendar_today icon
    const dateBtn = document.querySelector('button .material-symbols-outlined');
    // For now, just a simple last 30 days toggle
    // Can be expanded with a date picker later
  }

  // ── Pagination ─────────────────────────────────────────────────────────────
  function setupPagination() {
    const allBtns = document.querySelectorAll('button');
    let prevBtn = null;
    let nextBtn = null;
    allBtns.forEach(btn => {
      const icon = btn.querySelector('.material-symbols-outlined');
      if (icon) {
        if (icon.textContent.trim() === 'chevron_left') prevBtn = btn;
        if (icon.textContent.trim() === 'chevron_right') nextBtn = btn;
      }
    });

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          loadCampaigns();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentPage * pageSize < totalCampaigns) {
          currentPage++;
          loadCampaigns();
        }
      });
    }
  }

  function updatePagination() {
    const showingText = document.querySelector('.border-t.border-border-subtle span');
    if (showingText) {
      const start = (currentPage - 1) * pageSize + 1;
      const end = Math.min(currentPage * pageSize, totalCampaigns);
      showingText.textContent = `Showing ${start}-${end} of ${totalCampaigns} campaigns`;
    }

    // Update page buttons
    const allBtns = document.querySelectorAll('button');
    let prevBtn = null;
    allBtns.forEach(btn => {
      const icon = btn.querySelector('.material-symbols-outlined');
      if (icon && icon.textContent.trim() === 'chevron_left') prevBtn = btn;
    });
    if (prevBtn) prevBtn.disabled = currentPage === 1;
  }
}
if(document.getElementById('GoToCreateCampaign')){
  document.getElementById('GoToCreateCampaign').addEventListener('click', function() {
    window.location.href = 'CreateCampaign.html';
  });
}

// ============================================================
// Contact Form — Join the Movement
// ============================================================
(function handleContactForm() {
  // Only run if the contact form exists on this page
  const form = document.querySelector('#contactForm');
  if (!form) return;

  const submitBtn = form.querySelector('button[type="submit"]');
  const btnText = submitBtn.querySelector('.btn-text');
  const btnSpinner = submitBtn.querySelector('.btn-spinner');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    // Gather values
    const fullName = document.getElementById('full-name')?.value.trim();
    const email     = document.getElementById('email')?.value.trim();
    const phone     = document.getElementById('phone')?.value.trim();
    const municipality = document.getElementById('Municipality')?.value;
    const wantsUpdate  = document.getElementById('join-checkbox')?.checked;

    // Validate required
    if (!fullName) return showToast('Please enter your full name.', 'error');
    if (!email)    return showToast('Please enter your email address.', 'error');
    if (!phone)    return showToast('Please enter your phone number.', 'error');
    if (!municipality) return showToast('Please select your municipality.', 'error');

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return showToast('Please enter a valid email address.', 'error');
    }

    // Disable button & show spinner
    submitBtn.disabled = true;
    btnText.textContent = 'Submitting…';
    btnSpinner.classList.remove('hidden');

    try {
      // 1) Save member data to database via a Supabase Edge Function
      const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmZG96emllenNleXdhdXVxZGRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTc2NjMsImV4cCI6MjA5NTAzMzY2M30.on3phI2woSvl7JU1LcuP6yze5FJCkpygGgfiOy6jAkI';

      // Split "John Doe" into name="John" and surname="Doe"
      const nameParts = fullName.split(' ');
      const memberName = nameParts[0] || '';
      const memberSurname = nameParts.slice(1).join(' ') || '';

      const memberPayload = {
        name: memberName,
        surname: memberSurname,
        email: email.toLowerCase(),
        phone: phone,
        municipality: municipality,
        wants_emails: wantsUpdate,
        status: 'unconfirmed',
        email_verified: false,
        source: 'website',
      };

      const insertRes = await fetch(
        'https://sfdozziezseywauuqddk.supabase.co/rest/v1/members',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify(memberPayload),
        }
      );

      if (!insertRes.ok) {
        // If status 409 (duplicate email), that's OK — silently proceed to send verification
        if (insertRes.status !== 409) {
          const errBody = await insertRes.text();
          console.error('[ContactForm] Insert error:', errBody);
          throw new Error('Failed to save member data. Please try again later.');
        }
      }

      // 2) Send verification email
      const verifyRes = await fetch(
        'https://sfdozziezseywauuqddk.supabase.co/functions/v1/send-verification',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            email: email.toLowerCase(),
            name: fullName,
          }),
        }
      );

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok || !verifyData.success) {
        console.error('[ContactForm] Verification send error:', verifyData.error);
        showToast(
          'Your application has been received, but the verification email failed to send. Please contact us.',
          'error'
        );
        return;
      }

      // 3) Success
      showToast(
        'Application submitted! Please check your email to verify your address.',
        'success'
      );
      form.reset();

    } catch (err) {
      console.error('[ContactForm] Error:', err);
      showToast(err.message || 'Something went wrong. Please try again.', 'error');
    } finally {
      submitBtn.disabled = false;
      btnText.textContent = 'Submit Application';
      btnSpinner.classList.add('hidden');
    }
  });
})();

// ============================================================
// Toast notification helper
// ============================================================
function showToast(message, type) {
  // Remove any existing toast
  const existing = document.querySelector('#asco-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'asco-toast';
  toast.setAttribute('role', 'alert');
  toast.className = `fixed top-20 right-4 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl transition-all duration-300 translate-x-0 font-body-md text-body-md ${
    type === 'success'
      ? 'bg-primary-container text-on-primary border border-primary-fixed-dim'
      : 'bg-error-container text-on-error-container border border-error'
  }`;

  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined text-[20px]';
  icon.textContent = type === 'success' ? 'check_circle' : 'error';
  toast.appendChild(icon);

  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  toast.appendChild(msgSpan);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ml-2 opacity-70 hover:opacity-100 transition-opacity';
  closeBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">close</span>';
  closeBtn.addEventListener('click', () => toast.remove());
  toast.appendChild(closeBtn);

  document.body.appendChild(toast);

  // Auto-dismiss after 8 seconds
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 8000);
}
