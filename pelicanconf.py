
# 主题设置
THEME = 'themes/storm'

# 导航栏设置
MENUITEMS = [
    ('Home', '/'),
    ('Archives', '/archives.html'),
]

# 启用 i18n 插件
PLUGINS = ['i18n_subsites']  # 或 'i18n'

# 配置 i18n
JINJA_ENVIRONMENT = {
    'extensions': ['jinja2.ext.i18n']
}

AUTHOR = 'nooae'
SITENAME = "Nooae's blog"
SITESUBTITLE = 'Good good study, day day up!'
SITEURL = "https://www.nooae.com"
FAVICON = '/themes/storm/favicon.ico'    # 浏览器图标

PATH = "content"

TIMEZONE = 'Asia/Shanghai'

DEFAULT_LANG = 'en'

# Feed generation is usually not desired when developing
FEED_ALL_ATOM = None
CATEGORY_FEED_ATOM = None
TRANSLATION_FEED_ATOM = None
AUTHOR_FEED_ATOM = None
AUTHOR_FEED_RSS = None



# Blogroll
LINKS = (
    ("Pelican", "https://getpelican.com/"),
    ("Python.org", "https://www.python.org/"),
    ("Jinja2", "https://palletsprojects.com/p/jinja/"),
    ("You can modify those links in your config file", "#"),
)

# Social widget
SOCIAL = ()

DEFAULT_PAGINATION = False

# Uncomment following line if you want document-relative URLs when developing
# RELATIVE_URLS = True


