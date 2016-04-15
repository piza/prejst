# prejst
precompile underscore template jst files into a AMD module


# how to install?
sudo npm install -g prejst

# how to use?
        mkdir tempate
        cd template 
        touch index.jst
        mkdir login
        cd login
        vi login.jst
        cd ..
 
        vi package.json

        {
             "name": "template",
             "version": "1.0.0",
             "dependencies": {
                 "prejst": "1.0.2"
             },
             "prejst-config": {
                 "output": "../scripts/template",
                 "charset": "utf-8",
                 "compress": true,
                 "runtime": "template.js",
                 "minify": false
             }
         }
 
        cd ..
        prejst ./template
        cat scripts/template/template.js
        //you will see below content
        temp{
                index:function(){},
                login:{
                login:function(){}
                }
            }

### study from [tmodjs](https://github.com/aui/tmodjs) 


        


