# prejst
precompile underscore template jst files into a AMD module

### 基于[tmodjs](https://github.com/aui/tmodjs) 修改的
把模板目录下的所有jst文件通过underscore 预编译，然后在封装到一个对象里面.对象的结构和文件夹的结构一样.
比如 template/index.jst   template/login/login.jst 这样的目录结构就会被封装成一个对象:

        temp{
            index:function(){},
            login:{
            login:function(){}
            }
        }


