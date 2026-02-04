with open('client/src/services/api.js', 'r') as f:
    content = f.read()

# Fix the remaining quote issues
content = content.replace('api.get(/users/credentials,', "api.get('/users/credentials',")

with open('client/src/services/api.js', 'w') as f:
    f.write(content)

print("Fixed API service")
