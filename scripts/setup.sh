
# Install all dependencies
npm install
#copy dependancies to places
npm run copy:deps

# move the `build/resources` folder to the project root folder (overwrite everything)
cp -rf ./build/resources ./
# move the `build/terrain` folder to the project root folder
cp -rf ./build/terrain ./

#copy up simconnect dll
cp build/Simconnect.dll ./
