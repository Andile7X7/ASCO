
    const supabaseUrl = 'https://sfdozziezseywauuqddk.supabase.co';
    const supabaseKey = 'sb_publishable_xTaqAs_Dg1akwQ5QumtXbA_eJ5N2vtp';
    const client = supabase.createClient(supabaseUrl, supabaseKey);

    const role = localStorage.getItem('role');

    if(role !== 'admin'){

    async function fetchBlogs() {
      try {
        const { data: blogs, error } = await client.from('blogs').select('*').eq('published', true);

        if (error) {
          console.error('Fetching blogs error:', error.message);
          return;
        }
        // displaying blog preview
          const container = document.getElementById('blog-list');
        container.innerHTML = blogs.map(blog => `
      <article class="flex flex-col md:flex-row gap-space-lg p-space-lg bg-surface cursor-pointer border border-border-subtle rounded-xl hover:border-primary transition-colors group" id="${blog.id}">
            <span class ="publishcheck hidden">${blog.published}</span>
        <div class="w-full md:w-1/3 aspect-[4/3] overflow-hidden rounded-lg bg-surface-container">
          <img class="w-full h-full object-coverS"
               src="${blog.featured_image}"
               alt="${blog.title}" />
        </div>
        <div class="w-full md:w-2/3 flex flex-col">
          <div class="flex items-center gap-space-sm mb-space-sm">
            <span class="bg-surface-container-high text-on-surface-variant px-space-sm py-1 rounded text-label-sm font-label-sm">
              ${blog.category || 'Uncategorized'}
            </span>
            <span class="text-on-surface-variant font-label-sm text-label-sm">
              ${new Date(blog.created_at).toLocaleDateString()}
            </span>
          </div>
          <h2 class="font-h2 text-h2 text-on-surface mb-space-sm group-hover:text-primary transition-colors">
            ${blog.title}
          </h2>
          <p class="font-body-md text-body-md text-on-surface-variant mb-space-lg line-clamp-2">
            ${blog.paragraph1}
          </p>
          <div class="mt-auto">
          <span class="inline-flex items-center gap-space-xs text-secondary font-label-sm text-label-sm hover:underline">
              Live
              <span class="material-symbols-outlined text-[18px]">stream</span>
            </span>
            <span class="inline-flex items-center gap-space-xs text-primary font-label-sm text-label-sm hover:underline">
              READ MORE 
              <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
            </span>
          </div>
        </div>
      </article>
    `).join('');
    attachArticleListeners();
    


        console.log('Blogs:', blogs);
      } catch (err) {
        console.error('Unexpected error:', err.message);
      }
    }
    fetchBlogs();
}
else if(role === 'admin'){
     async function fetchAdminBlogs() {
      try {
        const { data: blogs, error } = await client.from('blogs').select('*');

        if (error) {
          console.error('Fetching blogs error:', error.message);
          return;
        }
        // displaying blog preview
         const container = document.getElementById('blog-list');
container.innerHTML = blogs.map(blog => {
  // Decide status markup based on published flag
  const statusMarkup = blog.published
    ? `
      <span class="inline-flex items-center gap-space-xs text-secondary font-label-sm text-label-sm hover:underline">
        Live
        <span class="material-symbols-outlined text-[18px]">stream</span>
      </span>
    `
    : `
      <span class="inline-flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm hover:underline">
        Unpublished
        <span class="material-symbols-outlined text-[18px]">visibility_off</span>
      </span>
    `;

  return `
    <article class=" m-1 flex flex-col md:flex-row gap-space-lg p-space-lg bg-surface cursor-pointer border border-border-subtle rounded-xl hover:border-primary transition-colors group" id="${blog.id}">
      <span class="publishcheck hidden">${blog.published}</span>
      <div class="w-full md:w-1/3 aspect-[4/3] overflow-hidden rounded-lg bg-surface-container">
        <img class="w-full h-full object-cover"
             src="${blog.featured_image}"
             alt="${blog.title}" />
      </div>
      <div class="w-full md:w-2/3 flex flex-col">
        <div class="flex items-center gap-space-sm mb-space-sm">
          <span class="bg-surface-container-high text-on-surface-variant px-space-sm py-1 rounded text-label-sm font-label-sm">
            ${blog.category || 'Uncategorized'}
          </span>
          <span class="text-on-surface-variant font-label-sm text-label-sm">
            ${new Date(blog.created_at).toLocaleDateString()}
          </span>
        </div>
        <h2 class="font-h2 text-h2 text-on-surface mb-space-sm group-hover:text-primary transition-colors">
          ${blog.title}
        </h2>
        <p class="font-body-md text-body-md text-on-surface-variant mb-space-lg line-clamp-2">
          ${blog.paragraph1}
        </p>
        <div class="mt-auto">
          ${statusMarkup}
          <span class="inline-flex items-center gap-space-xs text-primary font-label-sm text-label-sm hover:underline">
            READ MORE 
            <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
          </span>
        </div>
      </div>
    </article>
  `;
}).join('');

    attachArticleListeners();
    


        console.log('Blogs:', blogs);
      } catch (err) {
        console.error('Unexpected error:', err.message);
      }
    }
    fetchAdminBlogs();

}

    // Call the function when page loads
    


function attachArticleListeners() {
  const articles = document.querySelectorAll("article[id]");
  articles.forEach(article => {
    article.addEventListener("click", () => {
      const blogId = article.getAttribute("id");
      // Redirect to viewBlog.html with the blog ID
      window.location.href = `viewBlog.html?id=${blogId}`;
    });
  });
}
    



